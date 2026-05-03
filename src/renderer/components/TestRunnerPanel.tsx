import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { sendChatCompletion } from '../lib/openrouterClient';
import type { NormalizedModel } from '../../shared/types';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'pending';
  duration?: number;
  error?: string;
  file?: string;
  line?: number;
}

interface TestRun {
  id: string;
  framework: string;
  command: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'passed' | 'failed' | 'error';
  results: TestResult[];
  output: string;
  passCount: number;
  failCount: number;
  skipCount: number;
}

type Framework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'cargo' | 'go' | 'unknown';

const FRAMEWORK_COMMANDS: Record<Framework, string> = {
  jest: 'npx jest --json 2>&1',
  vitest: 'npx vitest run --reporter=json 2>&1',
  mocha: 'npx mocha --reporter json 2>&1',
  pytest: 'pytest --tb=short -v 2>&1',
  cargo: 'cargo test 2>&1',
  go: 'go test -v ./... 2>&1',
  unknown: 'npm test 2>&1',
};

const FRAMEWORK_ICONS: Record<Framework, string> = {
  jest: '🃏',
  vitest: '⚡',
  mocha: '☕',
  pytest: '🐍',
  cargo: '🦀',
  go: '🔵',
  unknown: '🧪',
};

export default function TestRunnerPanel() {
  const [detectedFramework, setDetectedFramework] = useState<Framework>('unknown');
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [customCommand, setCustomCommand] = useState('');
  const [showCustomCommand, setShowCustomCommand] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const pushLog = useApp((s) => s.pushLog);
  const projectRoot = useApp((s) => s.projectRoot);
  const settings = useSettings((s) => s.settings);
  const addChatMessage = useApp((s) => s.addChatMessage);

  // Detect test framework on mount
  useEffect(() => {
    const detectFramework = async () => {
      if (!projectRoot) return;

      try {
        const pkgContent = await window.api.fs.readFileIfExists('package.json');
        if (pkgContent) {
          try {
            const pkg = JSON.parse(pkgContent) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (deps['vitest']) {
              setDetectedFramework('vitest');
              return;
            }
            if (deps['jest']) {
              setDetectedFramework('jest');
              return;
            }
            if (deps['mocha']) {
              setDetectedFramework('mocha');
              return;
            }
          } catch {
            // invalid package.json
          }
        }

        if (await window.api.fs.readFileIfExists('pytest.ini')) {
          setDetectedFramework('pytest');
          return;
        }

        const setupCfg = await window.api.fs.readFileIfExists('setup.cfg');
        if (setupCfg?.includes('[pytest]')) {
          setDetectedFramework('pytest');
          return;
        }

        if (await window.api.fs.readFileIfExists('Cargo.toml')) {
          setDetectedFramework('cargo');
          return;
        }

        if (await window.api.fs.readFileIfExists('go.mod')) {
          setDetectedFramework('go');
          return;
        }
      } catch {
        // Ignore errors
      }
    };

    detectFramework();
  }, [projectRoot]);

  // Parse test results from output
  const parseTestResults = (output: string, framework: Framework): TestResult[] => {
    const results: TestResult[] = [];

    try {
      if (framework === 'jest' || framework === 'vitest') {
        // Try to parse JSON output
        const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          for (const result of json.testResults || []) {
            for (const assertion of result.assertionResults || []) {
              results.push({
                name: assertion.fullName || assertion.title,
                status: assertion.status === 'passed' ? 'pass' : assertion.status === 'pending' ? 'skip' : 'fail',
                duration: assertion.duration,
                error: assertion.failureMessages?.join('\n'),
                file: result.name,
              });
            }
          }
        }
      } else if (framework === 'pytest') {
        // Parse pytest verbose output
        const lines = output.split('\n');
        for (const line of lines) {
          const passMatch = line.match(/^(.+)::(.+) PASSED/);
          if (passMatch) {
            results.push({
              name: passMatch[2],
              status: 'pass',
              file: passMatch[1],
            });
          }
          const failMatch = line.match(/^(.+)::(.+) FAILED/);
          if (failMatch) {
            results.push({
              name: failMatch[2],
              status: 'fail',
              file: failMatch[1],
            });
          }
          const skipMatch = line.match(/^(.+)::(.+) SKIPPED/);
          if (skipMatch) {
            results.push({
              name: skipMatch[2],
              status: 'skip',
              file: skipMatch[1],
            });
          }
        }
      } else if (framework === 'cargo') {
        // Parse cargo test output
        const lines = output.split('\n');
        for (const line of lines) {
          const testMatch = line.match(/test (.+) \.\.\. (ok|FAILED|ignored)/);
          if (testMatch) {
            results.push({
              name: testMatch[1],
              status: testMatch[2] === 'ok' ? 'pass' : testMatch[2] === 'ignored' ? 'skip' : 'fail',
            });
          }
        }
      } else if (framework === 'go') {
        // Parse go test output
        const lines = output.split('\n');
        for (const line of lines) {
          const passMatch = line.match(/--- PASS: (\S+) \((.+)s\)/);
          if (passMatch) {
            results.push({
              name: passMatch[1],
              status: 'pass',
              duration: parseFloat(passMatch[2]) * 1000,
            });
          }
          const failMatch = line.match(/--- FAIL: (\S+)/);
          if (failMatch) {
            results.push({
              name: failMatch[1],
              status: 'fail',
            });
          }
          const skipMatch = line.match(/--- SKIP: (\S+)/);
          if (skipMatch) {
            results.push({
              name: skipMatch[1],
              status: 'skip',
            });
          }
        }
      }
    } catch {
      // If parsing fails, just look for generic patterns
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('✓') || line.includes('PASS') || line.includes('ok')) {
          const match = line.match(/[✓✔] (.+)|PASS[ED]?\s+(.+)|ok\s+(.+)/);
          if (match) {
            results.push({
              name: (match[1] || match[2] || match[3]).trim(),
              status: 'pass',
            });
          }
        }
        if (line.includes('✗') || line.includes('FAIL') || line.includes('✘')) {
          const match = line.match(/[✗✘] (.+)|FAIL[ED]?\s+(.+)/);
          if (match) {
            results.push({
              name: (match[1] || match[2]).trim(),
              status: 'fail',
            });
          }
        }
      }
    }

    return results;
  };

  // Run tests
  const runTests = async (command?: string) => {
    if (isRunning) return;

    setIsRunning(true);
    const runId = `run-${Date.now()}`;
    const testCommand = command || customCommand || FRAMEWORK_COMMANDS[detectedFramework];

    const newRun: TestRun = {
      id: runId,
      framework: detectedFramework,
      command: testCommand,
      startTime: Date.now(),
      status: 'running',
      results: [],
      output: '',
      passCount: 0,
      failCount: 0,
      skipCount: 0,
    };

    setTestRuns((runs) => [newRun, ...runs]);
    setSelectedRun(newRun);

    try {
      const result = await window.api.tools.execute('run_shell', {
        command: testCommand,
        timeoutMs: 300000,
      });

      const resBody = result.result as { stdout?: string; stderr?: string } | undefined;
      const output =
        `${resBody?.stdout ?? ''}${resBody?.stderr ?? ''}`.trim() ||
        (result.error ?? 'Test run failed');

      const results = parseTestResults(output, detectedFramework);
      const passCount = results.filter((r) => r.status === 'pass').length;
      const failCount = results.filter((r) => r.status === 'fail').length;
      const skipCount = results.filter((r) => r.status === 'skip').length;

      const updatedRun: TestRun = {
        ...newRun,
        endTime: Date.now(),
        status: failCount > 0 ? 'failed' : result.success ? 'passed' : 'failed',
        results,
        output,
        passCount,
        failCount,
        skipCount,
      };

      setTestRuns((runs) => runs.map((r) => (r.id === runId ? updatedRun : r)));
      setSelectedRun(updatedRun);

      if (failCount > 0) {
        pushLog('warn', `Tests completed with ${failCount} failure(s)`);
      } else {
        pushLog('info', `Tests passed (${passCount} tests)`);
      }
    } catch (e) {
      const errorRun: TestRun = {
        ...newRun,
        endTime: Date.now(),
        status: 'error',
        output: (e as Error).message,
      };
      setTestRuns((runs) => runs.map((r) => (r.id === runId ? errorRun : r)));
      setSelectedRun(errorRun);
      pushLog('error', `Test run failed: ${(e as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Ask AI to fix failing tests
  const askToFix = async () => {
    if (!selectedRun || !settings.apiKey) return;

    const failingTests = selectedRun.results.filter((r) => r.status === 'fail');
    if (failingTests.length === 0) {
      pushLog('info', 'No failing tests to fix');
      return;
    }

    setIsFixing(true);

    try {
      const model = settings.defaultModel || 'anthropic/claude-3.5-sonnet';
      
      const systemPrompt = `You are an expert test debugger. Analyze the failing tests and provide a fix.
Be concise and focus on the root cause. If you can identify the issue, provide the corrected code.`;

      const failureDetails = failingTests
        .map((t) => `- ${t.name}${t.file ? ` (${t.file})` : ''}${t.error ? `\n  Error: ${t.error}` : ''}`)
        .join('\n');

      const userPrompt = `The following tests are failing:

${failureDetails}

Test output:
\`\`\`
${selectedRun.output.slice(-4000)}
\`\`\`

Please analyze the failures and suggest fixes.`;

      // Add the request to chat
      const userMsgId = `msg-${Date.now()}`;
      addChatMessage({
        id: userMsgId,
        role: 'user',
        content: `Fix the ${failingTests.length} failing test(s):\n${failureDetails}`,
        createdAt: Date.now(),
      });

      let response = '';
      const assistantMsgId = `msg-${Date.now()}-assistant`;
      addChatMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: Date.now(),
      });

      await sendChatCompletion({
        apiKey: settings.apiKey,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 4096,
        stream: true,
        freeMode: {
          enabled: false,
          strategy: 'router',
          freeModels: [] as NormalizedModel[],
        },
        onStreamChunk: (chunk) => {
          if (chunk.type === 'delta' && chunk.content) {
            response += chunk.content;
            useApp.getState().updateChatMessage(assistantMsgId, {
              content: response,
            });
          }
        },
      });

      useApp.getState().updateChatMessage(assistantMsgId, {
        content: response,
        streaming: false,
      });

      pushLog('info', 'AI analysis complete');
    } catch (e) {
      pushLog('error', `Failed to get AI fix: ${(e as Error).message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{FRAMEWORK_ICONS[detectedFramework]}</span>
          <span className="text-xs font-medium text-fg">Test Runner</span>
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-fg-muted">
            {detectedFramework}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCustomCommand(!showCustomCommand)}
            className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Custom command"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => runTests()}
            disabled={isRunning}
            className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </>
            ) : (
              <>▶ Run Tests</>
            )}
          </button>
        </div>
      </div>

      {/* Custom command input */}
      {showCustomCommand && (
        <div className="border-b border-border-soft px-3 py-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              placeholder={FRAMEWORK_COMMANDS[detectedFramework]}
              className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => runTests(customCommand)}
              disabled={isRunning || !customCommand.trim()}
              className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50"
            >
              Run
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Test runs list */}
        <div className="w-48 border-r border-border-soft overflow-auto">
          {testRuns.length === 0 ? (
            <div className="p-3 text-center text-xs text-fg-muted">
              No test runs yet
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {testRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`w-full rounded px-2 py-1.5 text-left ${
                    selectedRun?.id === run.id ? 'bg-accent/10' : 'hover:bg-bg-hover'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        run.status === 'running'
                          ? 'animate-pulse bg-yellow-500'
                          : run.status === 'passed'
                          ? 'bg-green-500'
                          : run.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                      }`}
                    />
                    <span className="text-[10px] text-fg-muted">
                      {new Date(run.startTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-subtle">
                    {run.status === 'running' ? (
                      'Running...'
                    ) : (
                      <>
                        <span className="text-green-500">{run.passCount}✓</span>{' '}
                        <span className="text-red-500">{run.failCount}✗</span>{' '}
                        {run.skipCount > 0 && <span className="text-yellow-500">{run.skipCount}⊘</span>}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Test run details */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedRun ? (
            <>
              {/* Results summary */}
              <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-500">{selectedRun.passCount} passed</span>
                  <span className="text-red-500">{selectedRun.failCount} failed</span>
                  {selectedRun.skipCount > 0 && (
                    <span className="text-yellow-500">{selectedRun.skipCount} skipped</span>
                  )}
                  {selectedRun.endTime && (
                    <span className="text-fg-muted">
                      {((selectedRun.endTime - selectedRun.startTime) / 1000).toFixed(2)}s
                    </span>
                  )}
                </div>
                {selectedRun.failCount > 0 && (
                  <button
                    onClick={askToFix}
                    disabled={isFixing || !settings.apiKey}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                  >
                    {isFixing ? '✨ Analyzing...' : '✨ Ask AI to Fix'}
                  </button>
                )}
              </div>

              {/* Results list */}
              <div className="flex-1 overflow-auto">
                {selectedRun.results.length > 0 ? (
                  <div className="divide-y divide-border-soft">
                    {selectedRun.results.map((result, idx) => (
                      <div key={idx} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 ${
                              result.status === 'pass'
                                ? 'text-green-500'
                                : result.status === 'fail'
                                ? 'text-red-500'
                                : 'text-yellow-500'
                            }`}
                          >
                            {result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⊘'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-fg">{result.name}</div>
                            {result.file && (
                              <div className="text-[10px] text-fg-subtle">{result.file}</div>
                            )}
                            {result.error && (
                              <pre className="mt-1 overflow-x-auto rounded bg-red-500/10 p-2 text-[10px] text-red-400">
                                {result.error}
                              </pre>
                            )}
                          </div>
                          {result.duration && (
                            <span className="text-[10px] text-fg-subtle">{result.duration}ms</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="mb-2 text-xs font-medium text-fg-muted">Raw Output</div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-bg-elevated p-2 text-[10px] text-fg-muted">
                      {selectedRun.output || 'No output'}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-fg-muted">
              Run tests to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
