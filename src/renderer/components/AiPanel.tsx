import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { sendChatCompletion, FREE_ROUTER_MODEL } from '../lib/openrouterClient';
import {
  ACTION_PROMPTS,
  buildSystemPrompt,
  buildUserMessage,
  buildUserMessageContent,
  messageContentToString,
  type ActionKey,
} from '../lib/prompts';
import { summarizeTree } from '../lib/fileUtils';
import { discoverFreeModels } from '../lib/modelFilters';
import { buildRulesPrompt, useRules } from '../store/rulesStore';
import { isLikelyVisionModel } from '../lib/attachments';
import ChatMessage from './ChatMessage';
import AttachmentBar from './AttachmentBar';
import AttachmentMenu from './AttachmentMenu';
import BranchSelector from './BranchSelector';
import CustomActionButtons from './CustomActionButtons';
import { deriveTaskTitle, newTaskId, parseLastMarker } from '../lib/agentLoop';
import { runToolLoop } from '../lib/toolLoop';
import { useTasks } from '../store/tasksStore';
import { useTools } from '../store/toolsStore';
import ToolCallCard from './ToolCallCard';
import { SuggestedActions } from './SuggestedActions';
import { ContextIndicator } from './ContextIndicator';
import { SlashCommandMenu } from './SlashCommandMenu';
import {
  executeCommand,
  parseCommandInput,
  findMatchingCommands,
  generateHelpText,
  type SlashCommand,
} from '../lib/slashCommands';
import type { AgentTask, AgentTaskStatus, Attachment, ToolCall } from '../../shared/types';
import type { ChatMsg } from '../store/appStore';

export default function AiPanel() {
  const chat = useApp((s) => s.chat);
  const addChatMessage = useApp((s) => s.addChatMessage);
  const updateChatMessage = useApp((s) => s.updateChatMessage);
  const clearChat = useApp((s) => s.clearChat);
  const editMessageAndBranch = useApp((s) => s.editMessageAndBranch);
  const deleteMessagesFrom = useApp((s) => s.deleteMessagesFrom);
  const forkConversation = useApp((s) => s.forkConversation);
  const conversationBranches = useApp((s) => s.conversationBranches);
  const setShowModelPicker = useApp((s) => s.setShowModelPicker);
  const freeModeEnabled = useApp((s) => s.freeModeEnabled);
  const setFreeMode = useApp((s) => s.setFreeMode);
  const pushLog = useApp((s) => s.pushLog);
  const tabs = useApp((s) => s.tabs);
  const activeTabPath = useApp((s) => s.activeTabPath);
  const selectedCode = useApp((s) => s.selectedCode);
  const fileTree = useApp((s) => s.fileTree);
  const projectRoot = useApp((s) => s.projectRoot);
  const models = useApp((s) => s.models);
  const aiPanelFocused = useApp((s) => s.aiPanelFocused);
  const setAiPanelFocused = useApp((s) => s.setAiPanelFocused);
  const setShowSettings = useApp((s) => s.setShowSettings);

  const settings = useSettings((s) => s.settings);
  const rules = useRules((s) => s.rules);
  const activeRuleCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);
  const attachments = useApp((s) => s.attachments);
  const addAttachment = useApp((s) => s.addAttachment);
  const clearAttachments = useApp((s) => s.clearAttachments);

  // Tool definitions
  const toolDefinitions = useTools((s) => s.toolDefinitions);
  const toolExecutions = useTools((s) => s.executions);
  const clearToolExecutions = useTools((s) => s.clearExecutions);
  const loadToolDefinitions = useTools((s) => s.loadDefinitions);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [ctxCurrentFile, setCtxCurrentFile] = useState(true);
  const [ctxSelection, setCtxSelection] = useState(true);
  const [ctxTree, setCtxTree] = useState<boolean>(settings.includeProjectTree);
  const [ctxFullFile, setCtxFullFile] = useState<boolean>(settings.includeFullFile);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Agent task state — lightly cached so the banner updates without a roundtrip.
  const activeTaskId = useTasks((s) => s.activeTaskId);
  const setActiveTaskId = useTasks((s) => s.setActive);
  const saveTask = useTasks((s) => s.save);
  const [taskCache, setTaskCache] = useState<AgentTask | null>(null);

  // Ref-based cancel flag so auto-continue bails out even if React state is stale.
  const cancelAgentRef = useRef(false);

  useEffect(() => {
    setCtxTree(settings.includeProjectTree);
    setCtxFullFile(settings.includeFullFile);
  }, [settings.includeProjectTree, settings.includeFullFile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    if (aiPanelFocused) {
      inputRef.current?.focus();
      setAiPanelFocused(false);
    }
  }, [aiPanelFocused, setAiPanelFocused]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activeTabPath) ?? null,
    [tabs, activeTabPath],
  );

  const displayedModel = freeModeEnabled
    ? settings.freeModeStrategy === 'router'
      ? FREE_ROUTER_MODEL
      : 'free-cycle'
    : settings.defaultModel;

  const modelMeta = useMemo(
    () => models.find((m) => m.id === displayedModel) ?? null,
    [models, displayedModel],
  );

  /**
   * Persist the current chat as an AgentTask snapshot. Called after every
   * assistant response and on terminal-state transitions so that a crash or
   * force-quit leaves the task resumable.
   */
  const persistTask = useCallback(
    async (
      taskId: string,
      opts: {
        goal: string;
        status: AgentTaskStatus;
        iterationDelta?: number;
        lastMarker?: string | null;
        lastError?: string | null;
        modelUsed?: string | null;
      },
    ): Promise<AgentTask | null> => {
      const prev = useTasks.getState().tasks.find((t) => t.id === taskId) ?? taskCache;
      const chatNow = useApp.getState().chat;
      const msgs: AgentTask['messages'] = chatNow
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const now = Date.now();
      const snapshot: AgentTask = {
        id: taskId,
        title: prev?.title ?? deriveTaskTitle(opts.goal),
        goal: prev?.goal ?? opts.goal,
        status: opts.status,
        iterations: (prev?.iterations ?? 0) + (opts.iterationDelta ?? 0),
        maxIterations: settings.maxAgentIterations,
        modelUsed: opts.modelUsed ?? prev?.modelUsed ?? settings.defaultModel,
        projectRoot: useApp.getState().projectRoot,
        messages: msgs,
        lastMarker: opts.lastMarker ?? prev?.lastMarker ?? null,
        lastError: opts.lastError ?? null,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      const saved = await saveTask(snapshot);
      if (saved) setTaskCache(saved);
      return saved;
    },
    [saveTask, settings.maxAgentIterations, settings.defaultModel, taskCache],
  );

  const send = useCallback(
    async (userText: string, opts?: { isAutoContinue?: boolean }) => {
      if (!userText.trim()) return;
      if (!settings.apiKey) {
        pushLog('error', 'OpenRouter API key missing. Add it in Settings.');
        setShowSettings(true);
        return;
      }

      const isAutoContinue = opts?.isAutoContinue === true;

      // --- Agent task bookkeeping -------------------------------------------
      // Every user-initiated send in Agent Mode starts (or continues) a task.
      let taskId = useTasks.getState().activeTaskId;
      if (settings.agentMode && !taskId) {
        taskId = newTaskId();
        setActiveTaskId(taskId);
        cancelAgentRef.current = false;
      }

      const userId = 'u_' + Math.random().toString(36).slice(2);
      const assistId = 'a_' + Math.random().toString(36).slice(2);

      // Auto-continue turns use a minimal context: we don't want to re-ship the
      // whole project tree every iteration, and there's no new user attachment.
      const snapshot = isAutoContinue ? [] : attachments;
      const ctxInput = {
        userPrompt: userText,
        currentFilePath: !isAutoContinue && ctxCurrentFile ? activeTab?.relativePath ?? null : null,
        currentFileContent: !isAutoContinue && ctxFullFile ? activeTab?.content ?? null : null,
        selectedCode: !isAutoContinue && ctxSelection && selectedCode ? selectedCode : null,
        selectedLanguage: activeTab?.language ?? null,
        projectTree: !isAutoContinue && ctxTree ? summarizeTree(fileTree) : null,
        includeFullFile: !isAutoContinue && ctxFullFile,
        includeProjectTree: !isAutoContinue && ctxTree,
        attachments: snapshot,
      };
      const userContent = buildUserMessageContent(ctxInput);
      const userDisplayText = buildUserMessage(ctxInput);

      const msgs: ChatMsg[] = useApp.getState().chat;
      const history = msgs
        .filter((m) => !m.error && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: m.content }));

      addChatMessage({
        id: userId,
        role: 'user',
        content: userDisplayText,
        createdAt: Date.now(),
      });
      addChatMessage({
        id: assistId,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: Date.now(),
      });

      setBusy(true);
      if (!isAutoContinue) clearAttachments();

      const freeModels = discoverFreeModels(models);
      const rulesBlock = buildRulesPrompt(rules);
      let systemPrompt = buildSystemPrompt(rulesBlock, settings.agentMode);
      const safetyLines: string[] = [];
      if (settings.agentSandboxMode) {
        safetyLines.push(
          'Agent sandbox is ON: mutating tools are removed or restricted (writes, shell, git stage/commit, branch changes except list, tests, memory writes).',
        );
      }
      if (settings.agentDryRunMode) {
        safetyLines.push(
          'Agent dry-run is ON: remaining mutating tool calls return simulated JSON with dry_run: true (no disk writes or command execution).',
        );
      }
      if (safetyLines.length > 0) {
        systemPrompt +=
          '\n\n### Safety mode\n' + safetyLines.map((line) => `- ${line}`).join('\n');
      }

      const hasImage = snapshot.some((a) => a.kind === 'image');
      if (hasImage && !freeModeEnabled) {
        const meta = models.find((m) => m.id === settings.defaultModel) ?? null;
        if (!isLikelyVisionModel(settings.defaultModel, meta)) {
          pushLog(
            'warn',
            `Image attached but "${settings.defaultModel}" may not accept images. ` +
              'Consider switching to a vision-capable model (e.g. a GPT-4o / Claude / Gemini model).',
          );
        }
      }

      const goalForTask = isAutoContinue ? (taskCache?.goal ?? userText) : userText;

      try {
        const result = await sendChatCompletion({
          apiKey: settings.apiKey,
          model: settings.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map((m) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : messageContentToString(m.content),
            })),
            { role: 'user', content: userContent },
          ],
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          stream: settings.streaming,
          freeMode: {
            enabled: freeModeEnabled,
            strategy: settings.freeModeStrategy,
            freeModels,
          },
          fallbackModel: settings.fallbackModel,
          onStreamChunk: (chunk) => {
            if (chunk.type === 'delta' && chunk.content) {
              const cur = useApp.getState().chat.find((m) => m.id === assistId);
              updateChatMessage(assistId, {
                content: (cur?.content ?? '') + chunk.content,
              });
            }
          },
          onLog: (m) => pushLog('info', m),
        });
        updateChatMessage(assistId, {
          content: result.content,
          modelUsed: result.modelUsed,
          streaming: false,
        });
        pushLog('info', `✓ Response from ${result.modelUsed}`);

        // --- Agent protocol handling --------------------------------------
        if (settings.agentMode && taskId) {
          const marker = parseLastMarker(result.content);
          const markerText = marker.raw ? `[[${marker.raw}]]` : null;

          let nextStatus: AgentTaskStatus;
          switch (marker.kind) {
            case 'complete':
              nextStatus = 'completed';
              break;
            case 'blocked':
              nextStatus = 'blocked';
              break;
            case 'error':
              nextStatus = 'failed';
              break;
            case 'continue':
              nextStatus = 'running';
              break;
            default:
              // Model ignored the protocol. Treat as paused (user can nudge it)
              // instead of looping blindly.
              nextStatus = 'paused';
          }

          const saved = await persistTask(taskId, {
            goal: goalForTask,
            status: nextStatus,
            iterationDelta: 1,
            lastMarker: markerText,
            lastError: marker.kind === 'error' ? marker.reason : null,
            modelUsed: result.modelUsed,
          });

          const usedIterations = saved?.iterations ?? 1;
          const atLimit = usedIterations >= settings.maxAgentIterations;

          if (marker.kind === 'continue' && !cancelAgentRef.current && !atLimit) {
            // Schedule the next turn on a macrotask so React can paint the
            // previous message and the Stop button stays responsive.
            setTimeout(() => {
              if (cancelAgentRef.current) return;
              void send('Continue. Pick up exactly where you left off. Do not repeat work.', {
                isAutoContinue: true,
              });
            }, 150);
            return;
          }
          if (marker.kind === 'continue' && atLimit) {
            pushLog(
              'warn',
              `Agent reached max iterations (${settings.maxAgentIterations}). Task paused — raise the limit in Settings or nudge it manually.`,
            );
            await persistTask(taskId, {
              goal: goalForTask,
              status: 'paused',
              lastMarker: markerText,
              modelUsed: result.modelUsed,
            });
          } else if (marker.kind === 'blocked') {
            pushLog('warn', `Task blocked: ${marker.reason ?? 'see assistant message'}`);
          } else if (marker.kind === 'error') {
            pushLog('error', `Task errored: ${marker.reason ?? 'see assistant message'}`);
          } else if (marker.kind === 'complete') {
            pushLog('info', `✓ Task complete after ${usedIterations} iteration(s)`);
          } else if (marker.kind === 'unknown') {
            pushLog(
              'warn',
              'Response had no protocol marker — stopping auto-continue. Enable the "Agent Discipline" rule or prompt the model to use [[TASK_COMPLETE]] / [[CONTINUE]].',
            );
          }
        }
      } catch (e) {
        const msg = (e as Error).message;
        updateChatMessage(assistId, { streaming: false, error: msg });
        pushLog('error', msg);
        if (settings.agentMode && taskId) {
          await persistTask(taskId, {
            goal: goalForTask,
            status: 'failed',
            iterationDelta: 1,
            lastError: msg,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [
      settings.apiKey,
      settings.defaultModel,
      settings.temperature,
      settings.maxTokens,
      settings.streaming,
      settings.freeModeStrategy,
      settings.fallbackModel,
      settings.agentMode,
      settings.maxAgentIterations,
      ctxCurrentFile,
      ctxFullFile,
      ctxSelection,
      ctxTree,
      activeTab,
      selectedCode,
      fileTree,
      models,
      rules,
      freeModeEnabled,
      attachments,
      addChatMessage,
      updateChatMessage,
      clearAttachments,
      pushLog,
      setShowSettings,
      setActiveTaskId,
      persistTask,
      taskCache,
    ],
  );

  const stopAgent = useCallback(() => {
    cancelAgentRef.current = true;
    if (activeTaskId) {
      void persistTask(activeTaskId, {
        goal: taskCache?.goal ?? '',
        status: 'paused',
      });
    }
    pushLog('info', 'Agent loop stopped.');
  }, [activeTaskId, persistTask, pushLog, taskCache]);

  const startNewTask = useCallback(() => {
    cancelAgentRef.current = false;
    setActiveTaskId(null);
    setTaskCache(null);
    clearChat();
  }, [setActiveTaskId, clearChat]);

  const runAction = useCallback(
    (key: ActionKey) => {
      const prompt = ACTION_PROMPTS[key];
      void send(prompt);
    },
    [send],
  );

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;

    // Tab completion for slash commands
    if (e.key === 'Tab' && showSlashMenu) {
      e.preventDefault();
      const matches = findMatchingCommands(input.slice(1));
      if (matches.length > 0) {
        setInput(`/${matches[0].name} `);
        setShowSlashMenu(false);
      }
      return;
    }

    // Escape to close slash menu
    if (e.key === 'Escape' && showSlashMenu) {
      setShowSlashMenu(false);
      return;
    }

    if (mod && e.key === 'Enter') {
      e.preventDefault();
      const v = input;
      setInput('');
      setShowSlashMenu(false);

      // Check if it's a slash command
      if (v.startsWith('/')) {
        const currentFile = tabs.find((t) => t.relativePath === activeTabPath)?.relativePath;
        const { result, special } = await executeCommand(v, {
          currentFile,
          selectedCode,
          projectRoot: projectRoot ?? undefined,
          chat,
        });

        // Handle special commands
        if (special) {
          switch (special) {
            case '[[CLEAR_CHAT]]':
              clearChat();
              return;
            case '[[COMPACT_CHAT]]':
              // Trigger compact via context indicator
              pushLog('info', 'Use the Compact button in the header to compress chat history.');
              return;
            case '[[NEW_TASK]]':
              startNewTask();
              return;
            case '[[SAVE_TASK]]':
              pushLog('info', 'Task auto-saved.');
              return;
            case '[[SHOW_HELP]]':
              addChatMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: generateHelpText(),
                createdAt: Date.now(),
              });
              return;
            case '[[OPEN_MODEL_PICKER]]':
              setShowModelPicker(true);
              return;
            case '[[OPEN_SETTINGS]]':
              setShowSettings(true);
              return;
          }
        }

        if (result) {
          void send(result);
        }
      } else {
        void send(v);
      }
    }
  };

  const handleSlashCommandSelect = (cmd: SlashCommand) => {
    setInput(`/${cmd.name} `);
    setShowSlashMenu(false);
    inputRef.current?.focus();
  };

  // --- drag-drop support: images + text files dropped onto the panel ---
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current++;
    setDropActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      try {
        const att = await fileToAttachment(f);
        if (att) addAttachment(att);
      } catch (err) {
        pushLog('error', `Drop failed: ${(err as Error).message}`);
      }
    }
  };

  // --- clipboard: paste images directly into the prompt ---
  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const it of imageItems) {
      const f = it.getAsFile();
      if (!f) continue;
      try {
        const att = await fileToAttachment(f);
        if (att) addAttachment(att);
      } catch (err) {
        pushLog('error', `Paste failed: ${(err as Error).message}`);
      }
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between border-b border-border-soft bg-bg-elevated px-3 py-2 shadow-chrome">
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            AI Assistant
          </div>
          <ContextIndicator />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border-soft bg-bg-soft px-2 py-1 text-[11px] font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:bg-bg-hover hover:text-fg"
            onClick={() => useApp.getState().setShowTasks(true)}
            title="Saved tasks (Ctrl+Shift+T)"
          >
            Tasks
          </button>
          {conversationBranches.length > 0 && <BranchSelector />}
          <button
            type="button"
            className="rounded-md border border-border-soft bg-bg-soft px-2 py-1 text-[11px] font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:bg-bg-hover hover:text-fg"
            onClick={() => useApp.getState().setShowRules(true)}
            title="Manage rules / skill files (Ctrl+Shift+R)"
          >
            Rules ({activeRuleCount})
          </button>
          <button
            type="button"
            className="rounded-md border border-border-soft bg-bg-soft px-2 py-1 text-[11px] font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:bg-bg-hover hover:text-fg"
            onClick={settings.agentMode ? startNewTask : clearChat}
            title={settings.agentMode ? 'Start a new agent task' : 'Clear conversation'}
          >
            {settings.agentMode ? 'New task' : 'Clear'}
          </button>
        </div>
      </div>

      {settings.agentMode && (
        <AgentStatusBar
          task={taskCache}
          busy={busy}
          onStop={stopAgent}
          onNewTask={startNewTask}
          onResume={() =>
            void send('Continue. Pick up exactly where you left off. Do not repeat work.', {
              isAutoContinue: true,
            })
          }
          maxIterations={settings.maxAgentIterations}
        />
      )}

      <div className="flex items-center justify-between gap-2 border-b border-border-soft bg-bg-soft px-3 py-2">
        <button
          className="flex min-w-0 items-center gap-2 truncate rounded border border-border px-2 py-1 text-left text-xs hover:bg-bg-hover"
          onClick={() => setShowModelPicker(true)}
          title="Ctrl/Cmd+Shift+M"
          disabled={freeModeEnabled}
        >
          <span className="text-fg-muted">Model:</span>
          <span className="truncate text-fg">
            {freeModeEnabled ? 'Free Mode active' : modelMeta?.name ?? settings.defaultModel}
          </span>
          {!freeModeEnabled && modelMeta && (
            <span
              className={
                'shrink-0 rounded px-1 py-0 text-[9px] font-semibold ' +
                (modelMeta.priceTier === 'free'
                  ? 'bg-success/20 text-success'
                  : modelMeta.priceTier === 'cheap'
                  ? 'bg-accent/20 text-accent'
                  : modelMeta.priceTier === 'mid'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-danger/15 text-danger')
              }
            >
              {modelMeta.priceTier === 'free'
                ? 'FREE'
                : modelMeta.priceTier === 'cheap'
                ? '$'
                : modelMeta.priceTier === 'mid'
                ? '$$'
                : '$$$'}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          <label
            className="flex cursor-pointer items-center gap-1 text-[11px] text-fg-muted"
            title="Autonomous multi-turn task mode: the agent keeps going until it emits [[TASK_COMPLETE]]."
          >
            <input
              type="checkbox"
              checked={settings.agentMode}
              onChange={(e) => void useSettings.getState().update({ agentMode: e.target.checked })}
            />
            Agent Mode
          </label>
          <label
            className="flex cursor-pointer items-center gap-1 text-[11px] text-fg-muted"
            title="Hide mutating tools from the model and block them at runtime."
          >
            <input
              type="checkbox"
              checked={settings.agentSandboxMode}
              onChange={(e) =>
                void useSettings
                  .getState()
                  .update({ agentSandboxMode: e.target.checked })
                  .then(() => loadToolDefinitions())
              }
            />
            Sandbox
          </label>
          <label
            className="flex cursor-pointer items-center gap-1 text-[11px] text-fg-muted"
            title="Mutating tools return simulated JSON only (dry_run: true)."
          >
            <input
              type="checkbox"
              checked={settings.agentDryRunMode}
              onChange={(e) =>
                void useSettings.getState().update({ agentDryRunMode: e.target.checked })
              }
            />
            Dry-run
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={freeModeEnabled}
              onChange={(e) => setFreeMode(e.target.checked)}
            />
            Free Mode
          </label>
        </div>
      </div>

      {freeModeEnabled && (
        <div className="border-b border-border-soft bg-bg-soft px-3 py-2 text-[11px] text-fg-muted">
          Free Mode uses OpenRouter's free model router. Availability and limits may vary. Strategy:{' '}
          <strong className="text-fg">
            {settings.freeModeStrategy === 'router'
              ? 'OpenRouter Free Router'
              : 'Cycle Discovered Free Models'}
          </strong>
          .
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border-soft bg-bg-soft px-3 py-2">
        <ContextChip label="File" on={ctxCurrentFile} set={setCtxCurrentFile} />
        <ContextChip label="Selection" on={ctxSelection} set={setCtxSelection} />
        <ContextChip label="Tree" on={ctxTree} set={setCtxTree} />
        <ContextChip label="Full file" on={ctxFullFile} set={setCtxFullFile} />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border-soft bg-bg-soft px-3 py-2">
        <ActionBtn label="Explain" onClick={() => runAction('explain')} />
        <ActionBtn label="Fix bug" onClick={() => runAction('fix')} />
        <ActionBtn label="Refactor" onClick={() => runAction('refactor')} />
        <ActionBtn label="Generate" onClick={() => runAction('generate')} />
        <ActionBtn label="Comments" onClick={() => runAction('comment')} />
        <ActionBtn label="Unit test" onClick={() => runAction('test')} />
        <span className="mx-1 h-4 w-px bg-border-soft" />
        <CustomActionButtons onAction={(prompt) => void send(prompt)} />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-3 space-y-3">
        {chat.length === 0 ? (
          <div className="text-center text-xs text-fg-muted">
            <div className="mb-1 text-sm text-fg">Ask anything about your code.</div>
            <div>
              Use action buttons above or type a question below. Ctrl/Cmd+Enter to send.
            </div>
          </div>
        ) : (
          chat.map((m) => (
            <ChatMessage
              key={m.id}
              msg={m}
              onEdit={(newContent) => {
                editMessageAndBranch(m.id, newContent);
                // After editing, trigger a new response
                // The user can manually submit again
              }}
              onDelete={() => deleteMessagesFrom(m.id)}
              onFork={() => {
                const branchId = forkConversation(m.id);
                if (branchId) {
                  pushLog('info', 'Created new conversation branch');
                }
              }}
            />
          ))
        )}

        {/* Suggested actions after the last assistant message */}
        {chat.length > 0 && (
          <SuggestedActions
            lastMessage={chat[chat.length - 1]}
            onAction={(prompt) => setInput(prompt)}
            disabled={busy}
          />
        )}
      </div>

      <AttachmentBar />

      <div className="relative border-t border-border-soft bg-bg-elevated p-2">
        <SlashCommandMenu
          input={input}
          onSelect={handleSlashCommandSelect}
          visible={showSlashMenu}
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            // Show slash menu when typing /
            setShowSlashMenu(val.startsWith('/') && !val.includes(' '));
          }}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={
            busy
              ? 'Waiting for response…'
              : 'Type / for commands · Ctrl/Cmd+Enter to send'
          }
          rows={3}
          disabled={busy}
          className="w-full resize-none rounded-md border border-border bg-bg px-2 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
          <div className="flex items-center gap-2">
            <AttachmentMenu />
            {attachments.length > 0 && (
              <span className="text-fg-muted">
                {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate">{busy ? 'Sending…' : displayedModel}</span>
            <button
              disabled={busy || (!input.trim() && attachments.length === 0)}
              onClick={() => {
                const v = input;
                setInput('');
                void send(v);
              }}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-accent/20 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-accent bg-bg-soft px-6 py-4 text-center text-sm text-fg shadow-2xl">
            <div className="text-accent">Drop to attach</div>
            <div className="text-[11px] text-fg-muted">images or text files</div>
          </div>
        </div>
      )}
    </div>
  );
}

const MAX_DROP_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DROP_TEXT_BYTES = 1 * 1024 * 1024;

/** Convert a Web File (from drop / clipboard) into an Attachment. */
async function fileToAttachment(f: File): Promise<Attachment | null> {
  const id = Math.random().toString(36).slice(2, 12);
  if (f.type.startsWith('image/')) {
    if (f.size > MAX_DROP_IMAGE_BYTES) {
      throw new Error(
        `Image too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
      );
    }
    const dataUrl = await readAsDataUrl(f);
    return {
      id,
      kind: 'image',
      label: f.name || 'pasted image',
      filename: f.name || 'pasted image',
      imageUrl: dataUrl,
      sizeBytes: f.size,
    };
  }
  // Assume text for everything else.
  if (f.size > MAX_DROP_TEXT_BYTES) {
    throw new Error(`File too large (${(f.size / 1024).toFixed(0)} KB). Max 1 MB.`);
  }
  const text = await f.text();
  return {
    id,
    kind: 'file',
    label: f.name,
    filename: f.name,
    text,
    language: guessLangFromFilename(f.name),
    sizeBytes: f.size,
  };
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(r.error?.message ?? 'Read failed'));
    r.readAsDataURL(f);
  });
}

function guessLangFromFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  const ext = name.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    sql: 'sql',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
  };
  return map[ext] ?? 'plaintext';
}

function ContextChip({
  label,
  on,
  set,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => set(!on)}
      className={[
        'rounded-full border px-2 py-0.5 text-[11px] transition',
        on
          ? 'border-accent/40 bg-accent/20 text-fg'
          : 'border-border text-fg-muted hover:bg-bg-hover',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function AgentStatusBar({
  task,
  busy,
  maxIterations,
  onStop,
  onNewTask,
  onResume,
}: {
  task: AgentTask | null;
  busy: boolean;
  maxIterations: number;
  onStop: () => void;
  onNewTask: () => void;
  onResume: () => void;
}) {
  const status: AgentTaskStatus | 'idle' = busy ? 'running' : task?.status ?? 'idle';
  const iterations = task?.iterations ?? 0;

  const [badge, tone, label] = (() => {
    switch (status) {
      case 'running':
        return ['●', 'text-accent', 'Running'] as const;
      case 'blocked':
        return ['◐', 'text-warn', 'Blocked'] as const;
      case 'failed':
        return ['✕', 'text-danger', 'Failed'] as const;
      case 'paused':
        return ['❚❚', 'text-warn', 'Paused'] as const;
      case 'completed':
        return ['✓', 'text-success', 'Completed'] as const;
      default:
        return ['○', 'text-fg-muted', 'Idle — send a prompt to start a task'] as const;
    }
  })();

  const reason =
    status === 'blocked' || status === 'failed'
      ? task?.lastError ?? task?.lastMarker ?? null
      : null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-soft bg-bg-soft px-3 py-1.5 text-[11px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className={tone + ' font-bold'}>{badge}</span>
        <span className="font-medium text-fg">{label}</span>
        {task && (
          <span className="text-fg-muted">
            · {iterations}/{maxIterations} iter
          </span>
        )}
        {task?.title && (
          <span className="truncate text-fg-muted" title={task.title}>
            · {task.title}
          </span>
        )}
        {reason && (
          <span className="truncate text-fg-subtle" title={reason}>
            — {reason}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {busy && (
          <button
            onClick={onStop}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Stop auto-continue after the current turn"
          >
            Stop
          </button>
        )}
        {!busy && (status === 'blocked' || status === 'paused') && (
          <button
            onClick={onResume}
            className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/20"
          >
            Resume
          </button>
        )}
        {!busy && task && (
          <button
            onClick={onNewTask}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            New task
          </button>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-border bg-bg px-2 py-1 text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {label}
    </button>
  );
}
