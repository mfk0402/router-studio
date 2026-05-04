import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { sendChatCompletion, FREE_ROUTER_MODEL } from '../lib/openrouterClient';
import { getCompletionRouting } from '../lib/completionRouting';
import {
  assertAllowsEstimatedCompletion,
  recordCompletionBudgetUsage,
  getDailyCompletionTokensUsed,
  getSessionCompletionTokensUsed,
} from '../lib/usageBudget';
import { estimateTokens } from './TokenMeter';
import { buildTaskReceiptMarkdown } from '../lib/taskReceipt';
import {
  ACTION_PROMPTS,
  buildContextSummaryLine,
  buildSystemPrompt,
  buildUserMessageContent,
  messageContentToString,
  type ActionKey,
} from '../lib/prompts';
import { summarizeTree } from '../lib/fileUtils';
import { discoverFreeModels, CATEGORY_META } from '../lib/modelFilters';
import {
  resolveChatModelsForTurn,
  resolveVideoJobModelId,
  isRouterStudioAuto,
  parseRouterStudioAuto,
  type AutoRouteInferenceInput,
} from '../lib/autoModelRouting';
import { buildRulesPrompt, useRules } from '../store/rulesStore';
import { isLikelyVisionModel } from '../lib/attachments';
import ChatMessage from './ChatMessage';
import AttachmentBar from './AttachmentBar';
import AttachmentMenu from './AttachmentMenu';
import BranchSelector from './BranchSelector';
import CustomActionButtons from './CustomActionButtons';
import { ModeSwitcher } from './ModeSwitcher';
import { ComposerPanel } from './ComposerPanel';
import BrowserPanel from './BrowserPanel';
import { TaskChecklist } from './TaskChecklist';
import { stripInlineModePrefix } from '../lib/modePrefix';
import { expandRouterCommandLanguage } from '../lib/routerCommandLanguage';
import { applyPlanMarkers, defaultAgentPlan } from '../lib/planMarkers';
import { deriveTaskTitle, looksLikeConcreteRepoWork, newTaskId, parseLastMarker } from '../lib/agentLoop';
import { runToolLoop } from '../lib/toolLoop';
import { likelyNoToolsOpenRouterModel, isOpenRouterToolUseUnsupportedError } from '../lib/modelCapabilities';
import { chatModalitiesForOpenRouter } from '../lib/openrouterMultimodal';
import { isAgentProtocolProductMode } from '../../shared/productMode';
import { useTasks } from '../store/tasksStore';
import { useTools } from '../store/toolsStore';
import ToolCallCard from './ToolCallCard';
import VideoGenerationModal from './VideoGenerationModal';
import { SuggestedActions } from './SuggestedActions';
import { ContextIndicator } from './ContextIndicator';
import { toast } from './ToastContainer';
import { SlashCommandMenu } from './SlashCommandMenu';
import {
  executeCommand,
  parseCommandInput,
  findMatchingCommands,
  generateHelpText,
  type SlashCommand,
} from '../lib/slashCommands';
import type {
  AgentTask,
  AgentTaskStatus,
  Attachment,
  ChatMessage as ChatMessagePayload,
  ComposerSessionState,
  OpenRouterVideoSubmitRequest,
  TaskPlanStep,
  ToolCall,
} from '../../shared/types';
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
  const [showVideoGenModal, setShowVideoGenModal] = useState(false);
  const [videoGenSeedPrompt, setVideoGenSeedPrompt] = useState('');
  const videoGenModalKick = useApp((s) => s.videoGenModalKick);
  /** -1 = not yet synced to store; avoids treating initial kick as a user request on mount. */
  const prevVideoKickRef = useRef(-1);
  const latestInputRef = useRef('');
  latestInputRef.current = input;

  useEffect(() => {
    const kick = videoGenModalKick ?? 0;
    if (prevVideoKickRef.current === -1) {
      prevVideoKickRef.current = kick;
      return;
    }
    if (kick <= prevVideoKickRef.current) return;
    prevVideoKickRef.current = kick;
    setVideoGenSeedPrompt(latestInputRef.current.trim());
    setShowVideoGenModal(true);
  }, [videoGenModalKick]);
  const roughOutgoingPromptTokens = useMemo(() => {
    const tail = chat
      .filter((m) => !m.error && (m.role === 'user' || m.role === 'assistant'))
      .slice(-16)
      .map((m) => m.content)
      .join('\n');
    return estimateTokens(`${input}\n${tail}`) + 2000;
  }, [chat, input]);

  const copyTaskReceiptMd = useCallback(() => {
    const md = buildTaskReceiptMarkdown({
      chat: useApp.getState().chat,
      executions: useTools.getState().executions.values(),
      projectRoot,
    });
    void navigator.clipboard.writeText(md).then(
      () => toast.success('Copied', 'Task receipt (markdown)'),
      () => toast.error('Clipboard', 'Could not copy'),
    );
  }, [projectRoot]);

  const [busy, setBusy] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [ctxCurrentFile, setCtxCurrentFile] = useState(true);
  const [ctxSelection, setCtxSelection] = useState(true);
  const [ctxTree, setCtxTree] = useState<boolean>(settings.includeProjectTree);
  const [ctxFullFile, setCtxFullFile] = useState<boolean>(settings.includeFullFile);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  // Agent task state — lightly cached so the banner updates without a roundtrip.
  const activeTaskId = useTasks((s) => s.activeTaskId);
  const setActiveTaskId = useTasks((s) => s.setActive);
  const saveTask = useTasks((s) => s.save);
  const [taskCache, setTaskCache] = useState<AgentTask | null>(null);
  const showComposerPanel = useApp((s) => s.showComposerPanel);
  const setShowComposerPanel = useApp((s) => s.setShowComposerPanel);
  const showBrowserPanel = useApp((s) => s.showBrowserPanel);
  const setShowBrowserPanel = useApp((s) => s.setShowBrowserPanel);

  // Ref-based cancel flag so auto-continue bails out even if React state is stale.
  const cancelAgentRef = useRef(false);
  const toolLoopAbortRef = useRef<AbortController | null>(null);
  /** Counts forced re-runs when the model emits [[TASK_COMPLETE]] without running tools for edit-like asks. */
  const prematureCompleteRetriesRef = useRef(0);
  /** While true, user prompts are queued instead of starting a parallel turn (includes agent [[CONTINUE]] chains). */
  const queueBlockingRef = useRef(false);
  const userMessageQueueRef = useRef<string[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

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

  const modelToolbarLabel = useMemo(() => {
    if (freeModeEnabled) return 'Free Mode';
    const id = settings.defaultModel;
    if (!isRouterStudioAuto(id)) {
      return models.find((m) => m.id === id)?.name ?? id;
    }
    const p = parseRouterStudioAuto(id);
    if (p?.kind === 'infer') return 'Auto (infer task)';
    if (p?.kind === 'category') return `Auto (${CATEGORY_META[p.category].label})`;
    return id;
  }, [freeModeEnabled, settings.defaultModel, models]);

  const modelMeta = useMemo(
    () => models.find((m) => m.id === displayedModel) ?? null,
    [models, displayedModel],
  );

  const handleChatEdit = useCallback(
    (messageId: string, newContent: string) => {
      editMessageAndBranch(messageId, newContent);
    },
    [editMessageAndBranch],
  );

  const handleChatDeleteFrom = useCallback(
    (messageId: string) => {
      deleteMessagesFrom(messageId);
    },
    [deleteMessagesFrom],
  );

  const handleChatFork = useCallback(
    (messageId: string) => {
      const branchId = forkConversation(messageId);
      if (branchId) {
        pushLog('info', 'Created new conversation branch');
      }
    },
    [forkConversation, pushLog],
  );

  const handleSuggestedAction = useCallback((prompt: string) => {
    setInput(prompt);
  }, []);

  const persistComposerSnapshot = useCallback(
    async (composer: ComposerSessionState) => {
      const tid = useTasks.getState().activeTaskId;
      if (!tid) return;
      const prev = useTasks.getState().tasks.find((t) => t.id === tid) ?? taskCache;
      if (!prev) return;
      const now = Date.now();
      const next: AgentTask = {
        ...prev,
        composer: { ...composer, updatedAt: now },
        updatedAt: now,
      };
      const saved = await saveTask(next);
      if (saved) setTaskCache(saved);
    },
    [saveTask, taskCache],
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
        assistantContent?: string | null;
        plan?: TaskPlanStep[];
      },
    ): Promise<AgentTask | null> => {
      const prev = useTasks.getState().tasks.find((t) => t.id === taskId) ?? taskCache;
      const chatNow = useApp.getState().chat;
      const msgs: AgentTask['messages'] = chatNow
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const now = Date.now();

      let planOut = opts.plan ?? prev?.plan;
      if (
        (!planOut || planOut.length === 0) &&
        (settings.agentMode || isAgentProtocolProductMode(settings.productMode))
      ) {
        planOut = defaultAgentPlan();
      }
      if (planOut && opts.assistantContent) {
        planOut = applyPlanMarkers(planOut, opts.assistantContent);
      }

      const snapshot: AgentTask = {
        id: taskId,
        parentTaskId: prev?.parentTaskId ?? null,
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
        plan: planOut,
        composer: prev?.composer,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      const saved = await saveTask(snapshot);
      if (saved) setTaskCache(saved);
      return saved;
    },
    [
      saveTask,
      settings.maxAgentIterations,
      settings.defaultModel,
      settings.agentMode,
      settings.productMode,
      taskCache,
    ],
  );

  const runChatTurn = useCallback(
    async (userText: string, opts?: { isAutoContinue?: boolean }) => {
      let scheduledAgentContinue = false;
      const trimmedInput = userText.trim();
      if (!trimmedInput) return;

      queueBlockingRef.current = true;

      const isAutoContinue = opts?.isAutoContinue === true;
      if (!isAutoContinue) {
        prematureCompleteRetriesRef.current = 0;
      }

      let effectiveProductMode = settings.productMode;
      let userPromptForModel = trimmedInput;
      if (!isAutoContinue) {
        const { stripped, modeOverride } = stripInlineModePrefix(trimmedInput);
        effectiveProductMode = modeOverride ?? settings.productMode;
        userPromptForModel = stripped.trim() || trimmedInput;
        if (modeOverride && !stripped.trim()) {
          pushLog('warn', 'Add a message after the mode prefix (e.g. `@agent fix login`).');
          queueBlockingRef.current = false;
          return;
        }
      }

      let effectiveFreeMode = freeModeEnabled;
      let routeSmart = settings.smartAgentRouting;
      let routerInjectedMd = '';
      if (!isAutoContinue) {
        try {
          const rx = await expandRouterCommandLanguage(userPromptForModel);
          userPromptForModel = rx.userText.trim() || userPromptForModel;
          routerInjectedMd = rx.injectedMarkdown;
          if (rx.ephemeralFreeMode) effectiveFreeMode = true;
          if (rx.ephemeralSmartRouting) routeSmart = true;
          for (const n of rx.directiveNotes) pushLog('info', n);
        } catch (e) {
          pushLog('warn', `Router commands: ${(e as Error).message}`);
        }
      }

      const composedUserPrompt = routerInjectedMd
        ? `${userPromptForModel}\n\n${routerInjectedMd}`.trim()
        : userPromptForModel;

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
        userPrompt: composedUserPrompt,
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
      const persistedUserContent = messageContentToString(userContent);
      const summaryLine = buildContextSummaryLine(ctxInput);
      const displayContent =
        summaryLine.trim().length > 0 ? `${trimmedInput}\n\n${summaryLine}` : trimmedInput;

      const msgs: ChatMsg[] = useApp.getState().chat;
      const history = msgs
        .filter((m) => !m.error && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: m.content }));

      const hasImage = snapshot.some((a) => a.kind === 'image');
      const freeModels = discoverFreeModels(models);
      const estTokens =
        estimateTokens(persistedUserContent) +
        estimateTokens(
          history
            .map((m) =>
              typeof m.content === 'string' ? m.content : messageContentToString(m.content),
            )
            .join('\n'),
        );
      const routing = getCompletionRouting(settings);
      const inference: AutoRouteInferenceInput = {
        hasImageAttachment: hasImage,
        productMode: effectiveProductMode,
        toolsEnabled: settings.toolsEnabled,
        agentMode: settings.agentMode,
        userTextPreview: composedUserPrompt,
        estimatedPromptTokens: estTokens,
      };
      const resolvedModels = resolveChatModelsForTurn({
        settings,
        models,
        freeModels,
        freeModeEnabled: effectiveFreeMode,
        openAiBaseUrl: routing.openAiBaseUrl,
        inference,
      });
      const primaryModel = resolvedModels.primary;
      const readModel = resolvedModels.read;
      const reasoningModel = resolvedModels.reasoning;

      const rulesBlock = buildRulesPrompt(rules);
      let systemPrompt = buildSystemPrompt(rulesBlock, effectiveProductMode);
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

      if (hasImage && !effectiveFreeMode && !routing.openAiBaseUrl) {
        const meta = models.find((m) => m.id === primaryModel) ?? null;
        if (!isLikelyVisionModel(primaryModel, meta)) {
          pushLog(
            'warn',
            `Image attached but "${primaryModel}" may not accept images. ` +
              'Consider switching to a vision-capable model (e.g. a GPT-4o / Claude / Gemini model).',
          );
        }
      }

      if (!routing.openAiBaseUrl && !routing.apiKey?.trim()) {
        pushLog('error', 'OpenRouter API key missing. Add it in Settings.');
        setShowSettings(true);
        queueBlockingRef.current = false;
        return;
      }

      try {
        assertAllowsEstimatedCompletion(settings, settings.maxTokens);
      } catch (e) {
        const msg = (e as Error).message;
        pushLog('error', msg);
        toast.error('Token budget', msg);
        queueBlockingRef.current = false;
        return;
      }

      if (resolvedModels.wasAuto && !routing.openAiBaseUrl) {
        pushLog(
          'info',
          `Auto routing → ${primaryModel}` +
            (resolvedModels.inferredCategory ? ` (${resolvedModels.inferredCategory})` : ''),
        );
      }

      if (resolvedModels.modelSubstitutions?.length) {
        for (const sub of resolvedModels.modelSubstitutions) {
          pushLog(
            'warn',
            `${sub.role} model "${sub.requested}" cannot run text chat completions. Using "${sub.used}" for this turn. For video files, use /video with a video-capable model.`,
          );
        }
      }

      addChatMessage({
        id: userId,
        role: 'user',
        content: persistedUserContent,
        displayContent,
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

      const goalForTask = isAutoContinue ? (taskCache?.goal ?? trimmedInput) : userPromptForModel;

      const modelMetaForChat = models.find((m) => m.id === primaryModel) ?? null;
      const orChatMulti = chatModalitiesForOpenRouter(routing.openAiBaseUrl, modelMetaForChat);

      const runPlainCompletion = () =>
        sendChatCompletion({
          apiKey: routing.apiKey,
          openAiBaseUrl: routing.openAiBaseUrl,
          model: primaryModel,
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
          modalities: orChatMulti.modalities,
          freeMode: {
            enabled: effectiveFreeMode,
            strategy: settings.freeModeStrategy,
            freeModels,
          },
          fallbackModel: settings.fallbackModel,
          completionFallbackModels: settings.completionFallbackModels,
          onStreamChunk: (chunk) => {
            if (chunk.type === 'delta' && chunk.content) {
              const cur = useApp.getState().chat.find((m) => m.id === assistId);
              updateChatMessage(assistId, {
                content: (cur?.content ?? '') + chunk.content,
              });
            }
            if (chunk.type === 'delta' && chunk.generatedImageUrls?.length) {
              const cur = useApp.getState().chat.find((m) => m.id === assistId);
              const prev = cur?.generatedImageUrls ?? [];
              updateChatMessage(assistId, {
                generatedImageUrls: [...new Set([...prev, ...chunk.generatedImageUrls])],
              });
            }
          },
          onLog: (m) => pushLog('info', m),
        });

      const applyCompletionImages = (urls?: string[]) => {
        if (urls?.length) {
          updateChatMessage(assistId, { generatedImageUrls: urls });
        }
      };

      try {
        let usedToolLoop = false;
        let toolCallCountThisTurn = 0;
        const historyChat: ChatMessagePayload[] = history.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : messageContentToString(m.content),
        }));

        let result: { content: string; modelUsed: string };

        if (settings.toolsEnabled) {
          await loadToolDefinitions(effectiveProductMode);
          const defs = useTools.getState().toolDefinitions;
          if (defs.length > 0) {
            const readModelForTools = routeSmart ? readModel : primaryModel;
            const skipToolsForModel =
              !routing.openAiBaseUrl && likelyNoToolsOpenRouterModel(readModelForTools);

            if (skipToolsForModel) {
              pushLog(
                'info',
                `Model "${readModelForTools}" typically has no tool endpoint on OpenRouter — using chat completion without tools.`,
              );
              toast.info(
                'Tools unavailable',
                'This model type usually cannot run agent tools on OpenRouter. Replying in plain chat.',
              );
              const cycleOut = await runPlainCompletion();
              recordCompletionBudgetUsage(cycleOut.usage);
              applyCompletionImages(cycleOut.generatedImageUrls);
              result = { content: cycleOut.content, modelUsed: cycleOut.modelUsed };
            } else {
              usedToolLoop = true;
              if (effectiveFreeMode) {
                pushLog(
                  'info',
                  'Tool calling is active: this turn uses your primary model only (Free Mode router/cycle is skipped while tools run).',
                );
              }
              const ac = new AbortController();
              toolLoopAbortRef.current = ac;
              try {
                try {
                  const loopResult = await runToolLoop({
                    apiKey: routing.apiKey,
                    openAiBaseUrl: routing.openAiBaseUrl,
                    fallbackModel: settings.fallbackModel,
                    completionFallbackModels: settings.completionFallbackModels,
                    model: readModelForTools,
                    reasoningModel: routeSmart ? reasoningModel : undefined,
                    systemPrompt,
                    history: historyChat,
                    userContent,
                    temperature: settings.temperature,
                    maxTokens: settings.maxTokens,
                    tools: defs,
                    maxToolHops: settings.maxToolHops,
                    activeTaskId: taskId ?? null,
                    productMode: effectiveProductMode,
                    abortSignal: ac.signal,
                    onStreamChunk: (chunk) => {
                      if (chunk.type === 'delta' && chunk.content) {
                        const cur = useApp.getState().chat.find((m) => m.id === assistId);
                        updateChatMessage(assistId, {
                          content: (cur?.content ?? '') + chunk.content,
                        });
                      }
                    },
                    onToolCallStart: () => {},
                    onToolCallEnd: () => {},
                    onLog: (m) => pushLog('info', m),
                    onMessagesUpdate: () => {},
                  });
                  if (loopResult.aborted) {
                    throw new Error('Stopped.');
                  }
                  let textOut = loopResult.content;
                  if (loopResult.toolCallCount > 0) {
                    textOut += `\n\n— _${loopResult.toolCallCount} tool call(s)._`;
                  }
                  result = { content: textOut, modelUsed: loopResult.modelUsed };
                  toolCallCountThisTurn = loopResult.toolCallCount;
                } catch (toolErr) {
                  const tm = (toolErr as Error).message;
                  if (isOpenRouterToolUseUnsupportedError(tm)) {
                    usedToolLoop = false;
                    pushLog(
                      'warn',
                      `Tool calling failed (no tool endpoint): ${tm.slice(0, 240)}`,
                    );
                    toast.info(
                      'Tools unavailable for this model',
                      'OpenRouter has no provider that supports tools for the selected model. Sending without tools.',
                    );
                    const cycleOut = await runPlainCompletion();
                    recordCompletionBudgetUsage(cycleOut.usage);
                    applyCompletionImages(cycleOut.generatedImageUrls);
                    result = { content: cycleOut.content, modelUsed: cycleOut.modelUsed };
                  } else {
                    throw toolErr;
                  }
                }
              } finally {
                toolLoopAbortRef.current = null;
              }
            }
          } else {
            const cycleOut = await runPlainCompletion();
            recordCompletionBudgetUsage(cycleOut.usage);
            applyCompletionImages(cycleOut.generatedImageUrls);
            result = { content: cycleOut.content, modelUsed: cycleOut.modelUsed };
          }
        } else {
          const cycleOut = await runPlainCompletion();
          recordCompletionBudgetUsage(cycleOut.usage);
          applyCompletionImages(cycleOut.generatedImageUrls);
          result = { content: cycleOut.content, modelUsed: cycleOut.modelUsed };
        }
        if (settings.agentReflectionPass && usedToolLoop && result.content.trim()) {
          try {
            const reflect = await sendChatCompletion({
              apiKey: routing.apiKey,
              openAiBaseUrl: routing.openAiBaseUrl,
              model: primaryModel,
              messages: [
                {
                  role: 'system',
                  content:
                    'You critique the assistant answer the user will paste. Be concise: up to 5 short bullets on risks, mistakes, or missing checks. If the answer looks fine, reply exactly: No major issues.',
                },
                {
                  role: 'user',
                  content:
                    result.content.length > 120_000
                      ? result.content.slice(0, 120_000) + '\n…[truncated]'
                      : result.content,
                },
              ],
              temperature: 0.2,
              maxTokens: 600,
              stream: false,
              freeMode: {
                enabled: false,
                strategy: settings.freeModeStrategy,
                freeModels: discoverFreeModels(models),
              },
              fallbackModel: settings.fallbackModel,
              completionFallbackModels: settings.completionFallbackModels,
              allowOfflineQueue: false,
            });
            recordCompletionBudgetUsage(reflect.usage);
            result = {
              ...result,
              content: result.content + '\n\n**Reflection**\n' + reflect.content,
              modelUsed: reflect.modelUsed,
            };
          } catch (e) {
            pushLog('warn', `Reflection pass failed: ${(e as Error).message}`);
          }
        }
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

          const prematureComplete =
            marker.kind === 'complete' &&
            settings.toolsEnabled &&
            usedToolLoop &&
            toolCallCountThisTurn === 0 &&
            looksLikeConcreteRepoWork(goalForTask) &&
            prematureCompleteRetriesRef.current < 3;

          if (prematureComplete) {
            prematureCompleteRetriesRef.current += 1;
            pushLog(
              'warn',
              `Ignoring premature [[TASK_COMPLETE]] — no tools ran for an edit-style request. Nudging model (${prematureCompleteRetriesRef.current}/3).`,
            );
            scheduledAgentContinue = true;
            await persistTask(taskId, {
              goal: goalForTask,
              status: 'running',
              iterationDelta: 1,
              lastMarker: 'CONTINUE',
              lastError: 'Premature TASK_COMPLETE without tool calls — runner forced another turn.',
              modelUsed: result.modelUsed,
              assistantContent: result.content,
            });
            setTimeout(() => {
              if (cancelAgentRef.current) {
                queueBlockingRef.current = false;
                return;
              }
              void runChatTurn(
                'Continue your task. You ended with [[TASK_COMPLETE]] but did not call any tools while the user asked for concrete codebase changes. Use read_file / edit_file / write_file / rename_file / delete_file / grep / list_recent_writes (relative paths) so edits apply on disk and appear in the UI diff review—then finish with [[TASK_COMPLETE]].',
                { isAutoContinue: true },
              );
            }, 150);
            return;
          }

          if (marker.kind === 'complete') {
            prematureCompleteRetriesRef.current = 0;
          }

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
            assistantContent: result.content,
          });

          const usedIterations = saved?.iterations ?? 1;
          const atLimit = usedIterations >= settings.maxAgentIterations;

          if (marker.kind === 'continue' && !cancelAgentRef.current && !atLimit) {
            scheduledAgentContinue = true;
            // Schedule the next turn on a macrotask so React can paint the
            // previous message and the Stop button stays responsive.
            setTimeout(() => {
              if (cancelAgentRef.current) {
                queueBlockingRef.current = false;
                return;
              }
              void runChatTurn('Continue. Pick up exactly where you left off. Do not repeat work.', {
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
              assistantContent: result.content,
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
        if (!scheduledAgentContinue) {
          queueBlockingRef.current = false;
          const next = userMessageQueueRef.current.shift();
          setQueuedCount(userMessageQueueRef.current.length);
          if (next?.trim()) {
            void runChatTurn(next);
          }
        }
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
      settings.completionFallbackModels,
      settings.agentMode,
      settings.productMode,
      settings.maxAgentIterations,
      settings.smartAgentRouting,
      settings.agentReadModel,
      settings.agentReasoningModel,
      settings.agentReflectionPass,
      settings.toolsEnabled,
      settings.maxToolHops,
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
      loadToolDefinitions,
    ],
  );

  const submitChat = useCallback(
    (userText: string, opts?: { isAutoContinue?: boolean }) => {
      if (opts?.isAutoContinue) {
        void runChatTurn(userText, opts);
        return;
      }
      const t = userText.trim();
      if (!t) return;
      if (queueBlockingRef.current) {
        userMessageQueueRef.current.push(t);
        const len = userMessageQueueRef.current.length;
        setQueuedCount(len);
        pushLog('info', `Queued message (${len} waiting)`);
        return;
      }
      void runChatTurn(userText, opts);
    },
    [runChatTurn, pushLog],
  );

  const runOpenRouterVideoJob = useCallback(
    async (req: OpenRouterVideoSubmitRequest) => {
      const apiKey = settings.apiKey?.trim();
      if (!apiKey) {
        toast.error('OpenRouter', 'Add your API key in Settings.');
        setShowSettings(true);
        return;
      }
      const model =
        req.model?.trim() || resolveVideoJobModelId(settings, models, freeModeEnabled);
      const body: OpenRouterVideoSubmitRequest = {
        ...req,
        model,
        prompt: req.prompt.trim(),
      };
      const explicitVideo = settings.openRouterVideoModel?.trim();
      if (
        !explicitVideo &&
        model !== settings.defaultModel &&
        !isRouterStudioAuto(settings.defaultModel) &&
        models.some((m) => m.id === settings.defaultModel)
      ) {
        pushLog(
          'info',
          `Video job uses \`${model}\` — your default model is not a video generator.`,
        );
      }
      const userId = crypto.randomUUID();
      const assistId = crypto.randomUUID();
      const displayLine = `/video ${body.prompt}`;
      addChatMessage({
        id: userId,
        role: 'user',
        content: displayLine,
        displayContent: displayLine,
        createdAt: Date.now(),
      });
      addChatMessage({
        id: assistId,
        role: 'assistant',
        content: 'Starting video generation…',
        streaming: true,
        modelUsed: model,
        createdAt: Date.now(),
      });
      setBusy(true);
      try {
        const submit = await window.api.openrouter.videoSubmit(apiKey, body);
        const jobStartedAt = Date.now();
        updateChatMessage(assistId, {
          content: `Job \`${submit.id}\` — **rendering on OpenRouter** (video generation can take a few minutes).`,
          streaming: true,
          videoRenderProgress: {
            jobId: submit.id,
            apiStatus: submit.status,
            pollIndex: 0,
            startedAt: jobStartedAt,
          },
        });
        const pollMs = 2500;
        const maxMs = 8 * 60 * 1000;
        const started = jobStartedAt;
        const pollUrl = submit.polling_url;
        let pollIndex = 0;
        while (Date.now() - started < maxMs) {
          const st = await window.api.openrouter.videoPoll(apiKey, pollUrl);
          pollIndex += 1;
          updateChatMessage(assistId, {
            videoRenderProgress: {
              jobId: submit.id,
              apiStatus: st.status,
              pollIndex,
              startedAt: jobStartedAt,
            },
          });
          if (st.status === 'completed') {
            const urls = st.unsigned_urls ?? [];
            if (urls.length === 0) {
              throw new Error('Video completed but no file URLs were returned.');
            }
            updateChatMessage(assistId, {
              content: '',
              streaming: false,
              generatedVideoUrls: urls,
              videoRenderProgress: undefined,
            });
            return;
          }
          if (
            st.status === 'failed' ||
            st.status === 'cancelled' ||
            st.status === 'expired'
          ) {
            throw new Error(st.error || `Video job ${st.status}`);
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
        throw new Error('Video generation timed out. Try again or check the OpenRouter dashboard.');
      } catch (e) {
        const msg = (e as Error).message;
        updateChatMessage(assistId, {
          content: '',
          streaming: false,
          error: msg,
          videoRenderProgress: undefined,
        });
        toast.error('Video generation', msg);
      } finally {
        setBusy(false);
      }
    },
    [
      settings.apiKey,
      settings.defaultModel,
      settings.openRouterVideoModel,
      freeModeEnabled,
      models,
      addChatMessage,
      updateChatMessage,
      setShowSettings,
      pushLog,
    ],
  );

  const openVideoGenerationModal = useCallback(() => {
    setVideoGenSeedPrompt(input.trim());
    setShowVideoGenModal(true);
  }, [input]);

  const runOpenRouterTtsJob = useCallback(
    async (payload: { text: string }) => {
      const apiKey = settings.apiKey?.trim();
      if (!apiKey) {
        toast.error('OpenRouter', 'Add your API key in Settings.');
        setShowSettings(true);
        return;
      }
      const ttsModel = settings.openRouterTtsModel?.trim();
      if (!ttsModel) {
        toast.error('TTS model', 'Set a Text-to-speech model in Settings → Models.');
        setShowSettings(true);
        return;
      }
      const voice = settings.openRouterTtsVoice?.trim() || 'alloy';
      const responseFormat = settings.openRouterTtsFormat;

      const userId = crypto.randomUUID();
      const assistId = crypto.randomUUID();
      const displayLine = `/tts ${payload.text}`;
      addChatMessage({
        id: userId,
        role: 'user',
        content: displayLine,
        displayContent: displayLine,
        createdAt: Date.now(),
      });
      addChatMessage({
        id: assistId,
        role: 'assistant',
        content: 'Synthesizing speech…',
        streaming: true,
        modelUsed: ttsModel,
        createdAt: Date.now(),
      });
      setBusy(true);
      try {
        const res = await window.api.openrouter.speech(apiKey, {
          model: ttsModel,
          input: payload.text,
          voice,
          response_format: responseFormat,
        });
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: res.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        const filename = `router-studio-tts-${Date.now()}.${res.fileExtension}`;

        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.rel = 'noopener';
        a.click();

        updateChatMessage(assistId, {
          content:
            `Speech saved as **${filename}** (check your Downloads folder). Use the player below or **Download again**.`,
          streaming: false,
          generatedAudioObjectUrl: objectUrl,
          ttsAudioFileName: filename,
        });
        toast.success('TTS', `Saved ${filename}`);
      } catch (e) {
        const msg = (e as Error).message;
        updateChatMessage(assistId, {
          content: '',
          streaming: false,
          error: msg,
        });
        toast.error('Text-to-speech', msg);
      } finally {
        setBusy(false);
      }
    },
    [
      settings.apiKey,
      settings.openRouterTtsModel,
      settings.openRouterTtsVoice,
      settings.openRouterTtsFormat,
      addChatMessage,
      updateChatMessage,
      setShowSettings,
    ],
  );

  const stopAgent = useCallback(() => {
    cancelAgentRef.current = true;
    toolLoopAbortRef.current?.abort();
    toolLoopAbortRef.current = null;
    userMessageQueueRef.current = [];
    setQueuedCount(0);
    queueBlockingRef.current = false;
    if (activeTaskId) {
      void persistTask(activeTaskId, {
        goal: taskCache?.goal ?? '',
        status: 'paused',
      });
    }
    pushLog('info', 'Agent loop stopped — queued prompts cleared.');
  }, [activeTaskId, persistTask, pushLog, taskCache]);

  const startNewTask = useCallback(() => {
    cancelAgentRef.current = false;
    userMessageQueueRef.current = [];
    setQueuedCount(0);
    queueBlockingRef.current = false;
    setActiveTaskId(null);
    setTaskCache(null);
    clearChat();
  }, [setActiveTaskId, clearChat]);

  const clearChatAndQueue = useCallback(() => {
    userMessageQueueRef.current = [];
    setQueuedCount(0);
    queueBlockingRef.current = false;
    clearChat();
  }, [clearChat]);

  const clearPendingQueueOnly = useCallback(() => {
    const n = userMessageQueueRef.current.length;
    userMessageQueueRef.current = [];
    setQueuedCount(0);
    if (n > 0) pushLog('info', `Cleared ${n} queued message(s)`);
  }, [pushLog]);

  const runAction = useCallback(
    (key: ActionKey) => {
      const prompt = ACTION_PROMPTS[key];
      void submitChat(prompt);
    },
    [submitChat],
  );

  const dispatchUserInput = useCallback(
    async (v: string) => {
      if (v.startsWith('/')) {
        const currentFile = tabs.find((t) => t.relativePath === activeTabPath)?.relativePath;
        const { result, special, openRouterVideo, openRouterTts, usageHint } = await executeCommand(v, {
          currentFile,
          selectedCode,
          projectRoot: projectRoot ?? undefined,
          chat,
        });

        if (special) {
          switch (special) {
            case '[[CLEAR_CHAT]]':
              clearChatAndQueue();
              return;
            case '[[COMPACT_CHAT]]':
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
            case '[[USAGE_HINT]]':
              addChatMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: usageHint ?? '',
                createdAt: Date.now(),
              });
              return;
            case '[[OPENROUTER_VIDEO]]':
              if (openRouterVideo) {
                const model = resolveVideoJobModelId(settings, models, freeModeEnabled);
                const ar =
                  openRouterVideo.aspect_ratio?.trim() ||
                  settings.openRouterVideoAspectRatio?.trim() ||
                  undefined;
                const res = settings.openRouterVideoResolution?.trim() || undefined;
                void runOpenRouterVideoJob({
                  model,
                  prompt: openRouterVideo.prompt,
                  ...(ar ? { aspect_ratio: ar } : {}),
                  ...(res ? { resolution: res } : {}),
                });
              }
              return;
            case '[[OPENROUTER_TTS]]':
              if (openRouterTts) void runOpenRouterTtsJob(openRouterTts);
              return;
          }
        }

        if (result) {
          void submitChat(result);
        }
      } else {
        void submitChat(v);
      }
    },
    [
      tabs,
      activeTabPath,
      selectedCode,
      projectRoot,
      chat,
      settings,
      models,
      freeModeEnabled,
      clearChatAndQueue,
      pushLog,
      startNewTask,
      addChatMessage,
      setShowModelPicker,
      setShowSettings,
      runOpenRouterVideoJob,
      runOpenRouterTtsJob,
      submitChat,
    ],
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
      void dispatchUserInput(v);
    }
  };

  const handleSlashCommandSelect = (cmd: SlashCommand) => {
    setInput(`/${cmd.name} `);
    setShowSlashMenu(false);
    inputRef.current?.focus();
  };

  const toggleVoiceInput = useCallback(() => {
    if (!settings.voiceInputEnabled || busy) return;
    if (voiceListening && speechRecRef.current) {
      speechRecRef.current.stop();
      speechRecRef.current = null;
      setVoiceListening(false);
      return;
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Speech recognition is not available in this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      if (text.trim()) {
        setInput((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
      }
    };
    rec.onerror = () => {
      setVoiceListening(false);
      speechRecRef.current = null;
      toast.error('Voice input error');
    };
    rec.onend = () => {
      setVoiceListening(false);
      speechRecRef.current = null;
    };
    speechRecRef.current = rec;
    try {
      rec.start();
      setVoiceListening(true);
    } catch (e) {
      speechRecRef.current = null;
      toast.error(`Voice start failed: ${(e as Error).message}`);
    }
  }, [settings.voiceInputEnabled, busy, voiceListening]);

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
      className="relative flex h-full min-h-0 min-w-0 flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="ai-chrome-header flex flex-col gap-2 px-3 py-2 ds-transition">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgb(var(--color-accent-default)/0.55)]" aria-hidden />
            <span className="text-xs font-semibold tracking-tight text-fg">AI Assistant</span>
          </div>
          <ContextIndicator />
          <span
            className="min-w-0 flex-1 truncate text-[10px] leading-tight text-fg-subtle"
            title="Rough context footprint + completion cap; budgets count completion tokens reported by the provider after each API hop."
          >
            {settings.aiCompletionProvider === 'local_openai' ? 'Local LLM' : 'OpenRouter'} · ~
            {roughOutgoingPromptTokens.toLocaleString()} tok · cap ↓{settings.maxTokens.toLocaleString()}
            {settings.sessionCompletionTokenBudget > 0
              ? ` · sess ${getSessionCompletionTokensUsed().toLocaleString()}/${settings.sessionCompletionTokenBudget.toLocaleString()}`
              : ''}
            {settings.dailyCompletionTokenBudget > 0
              ? ` · day ${getDailyCompletionTokensUsed().toLocaleString()}/${settings.dailyCompletionTokenBudget.toLocaleString()}`
              : ''}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-accent/50 bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent shadow-sm transition-colors duration-layout hover:bg-accent/25"
            onClick={openVideoGenerationModal}
            title="OpenRouter video: pick model, prompt, optional frames (async API)"
          >
            Generate video
          </button>
          <button
            type="button"
            className="rounded-md border border-border-soft bg-bg-soft px-2 py-1 text-[11px] font-medium text-fg-muted shadow-sm transition-colors duration-layout hover:bg-bg-hover hover:text-fg"
            onClick={copyTaskReceiptMd}
            title="Copy markdown summary of recent chat + tool runs (for PRs / tickets)"
          >
            Receipt
          </button>
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
            onClick={settings.agentMode ? startNewTask : clearChatAndQueue}
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
            void submitChat('Continue. Pick up exactly where you left off. Do not repeat work.', {
              isAutoContinue: true,
            })
          }
          maxIterations={settings.maxAgentIterations}
        />
      )}

      <div className="ai-toolbar-primary flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border-soft px-3 py-1.5 ds-transition">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-2 truncate rounded border border-border px-2 py-0.5 text-left text-[11px] hover:bg-bg-hover"
            onClick={() => setShowModelPicker(true)}
            title={
              freeModeEnabled
                ? 'Browse models (Free Mode: only free models can be selected). Ctrl/Cmd+Shift+M'
                : 'Choose model — Ctrl/Cmd+Shift+M'
            }
          >
            <span className="text-fg-muted">Model:</span>
            <span className="truncate text-fg">
              {freeModeEnabled ? 'Free Mode' : modelToolbarLabel}
            </span>
            {!freeModeEnabled && modelMeta && !isRouterStudioAuto(settings.defaultModel) && (
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
          <button
            type="button"
            className="shrink-0 rounded-md border border-accent/50 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/25"
            onClick={openVideoGenerationModal}
            title="OpenRouter async video (POST /api/v1/videos)"
          >
            Video
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeSwitcher compact />
          <button
            type="button"
            className="rounded border border-border-soft bg-bg px-2 py-0.5 text-[10px] text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="Multi-file Composer"
            onClick={() => setShowComposerPanel(true)}
          >
            Composer
          </button>
          <button
            type="button"
            className={
              'rounded border px-2 py-0.5 text-[10px] ' +
              (showBrowserPanel
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border-soft bg-bg text-fg-muted hover:bg-bg-hover hover:text-fg')
            }
            title="Browser preview (localhost) + Playwright tools for agents"
            onClick={() => setShowBrowserPanel(!showBrowserPanel)}
          >
            Browser
          </button>
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-fg-muted"
            title="Autonomous multi-turn task mode: the agent keeps going until it emits [[TASK_COMPLETE]]."
          >
            <input
              type="checkbox"
              checked={settings.agentMode}
              onChange={(e) => void useSettings.getState().update({ agentMode: e.target.checked })}
            />
            Agent
          </label>
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-fg-muted"
            title="Hide mutating tools from the model and block them at runtime."
          >
            <input
              type="checkbox"
              checked={settings.agentSandboxMode}
              onChange={(e) =>
                void useSettings
                  .getState()
                  .update({ agentSandboxMode: e.target.checked })
                  .then(() => loadToolDefinitions(settings.productMode))
              }
            />
            Sandbox
          </label>
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-fg-muted"
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
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-fg-muted">
            <input
              type="checkbox"
              checked={freeModeEnabled}
              onChange={(e) => setFreeMode(e.target.checked)}
            />
            Free
          </label>
        </div>
      </div>

      {freeModeEnabled && (
        <div className="border-b border-border-soft px-3 py-1 text-[10px] leading-snug text-fg-muted ds-transition">
          Free Mode —{' '}
          {settings.freeModeStrategy === 'router' ? 'OpenRouter Free Router' : 'cycling :free models'}.
        </div>
      )}

      <details className="border-b border-border-soft bg-bg-soft/15 open:bg-bg-soft/25">
        <summary className="cursor-pointer list-none px-3 py-1.5 text-[11px] text-fg-muted marker:content-none [&::-webkit-details-marker]:hidden hover:bg-bg-hover/50">
          <span className="font-medium text-fg-muted/95">Context &amp; quick prompts</span>{' '}
          <span className="text-[10px] text-fg-subtle">— tree, selection, shortcuts</span>
        </summary>
        <div className="space-y-1.5 px-3 pb-2">
          <div className="flex flex-wrap gap-1">
            <ContextChip label="File" on={ctxCurrentFile} set={setCtxCurrentFile} title="Include active file path" />
            <ContextChip
              label="Selection"
              on={ctxSelection}
              set={setCtxSelection}
              title="Include editor selection"
            />
            <ContextChip
              label="Tree"
              on={ctxTree}
              set={setCtxTree}
              title="Append compact project tree (skips node_modules, etc.). Use agent tools to read real files."
            />
            <ContextChip
              label="Full file"
              on={ctxFullFile}
              set={setCtxFullFile}
              title="Include entire active file contents"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t border-border-soft/60 pt-1.5">
            <ActionBtn label="Explain" onClick={() => runAction('explain')} />
            <ActionBtn label="Fix bug" onClick={() => runAction('fix')} />
            <ActionBtn label="Refactor" onClick={() => runAction('refactor')} />
            <ActionBtn label="Generate" onClick={() => runAction('generate')} />
            <ActionBtn label="Comments" onClick={() => runAction('comment')} />
            <ActionBtn label="Unit test" onClick={() => runAction('test')} />
            <span className="mx-1 h-4 w-px bg-border-soft" />
            <CustomActionButtons onAction={(prompt) => void submitChat(prompt)} />
          </div>
        </div>
      </details>

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-auto px-3 py-3 space-y-3">
        {taskCache?.plan && taskCache.plan.length > 0 ? (
          <details className="rounded-lg border border-border-soft/80 bg-bg-soft/30">
            <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-fg-muted marker:content-none [&::-webkit-details-marker]:hidden">
              Plan — {taskCache.plan.filter((s) => s.status === 'ok').length}/{taskCache.plan.length} done
            </summary>
            <div className="px-2 pb-2">
              <TaskChecklist
                steps={taskCache.plan}
                className="mb-0 border-0 bg-transparent"
                showHeader={false}
              />
            </div>
          </details>
        ) : null}
        {chat.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-soft bg-bg-soft/40 px-4 py-8 text-center">
            <div className="mb-1 text-base font-medium text-fg">Ask anything about your code</div>
            <div className="text-xs text-fg-muted">
              Use the model picker and expand <strong>Context &amp; quick prompts</strong> for file/tree shortcuts. Ctrl/Cmd+Enter to send.
            </div>
          </div>
        ) : (
          chat.map((m) => (
            <ChatMessage
              key={m.id}
              msg={m}
              onEdit={handleChatEdit}
              onDelete={handleChatDeleteFrom}
              onFork={handleChatFork}
            />
          ))
        )}

        {/* Suggested actions after the last assistant message */}
        {chat.length > 0 && (
          <SuggestedActions
            lastMessage={chat[chat.length - 1]}
            onAction={handleSuggestedAction}
            disabled={busy}
          />
        )}
        </div>
      </div>

      <AttachmentBar />

      {settings.taskTemplates && settings.taskTemplates.length > 0 ? (
        <div className="ai-chrome-footer px-2 pb-1 pt-1 ds-transition">
          <label htmlFor="task-template-select" className="sr-only">
            Insert saved task template into prompt
          </label>
          <select
            id="task-template-select"
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-fg"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              const t = settings.taskTemplates.find((x) => x.id === id);
              if (t) setInput((prev) => (prev ? `${prev}\n${t.prompt}` : t.prompt));
              e.target.value = '';
            }}
          >
            <option value="">Insert task template…</option>
            {settings.taskTemplates.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="relative border-t border-border-soft bg-gradient-to-b from-bg-elevated to-bg-soft p-3">
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
              ? queuedCount > 0
                ? 'Waiting for response… — more messages are queued'
                : 'Waiting for response…'
              : 'Type / for commands · Ctrl/Cmd+Enter to send'
          }
          rows={3}
          disabled={false}
          aria-label="AI chat message input"
          className="prompt-input-ds w-full resize-none text-sm leading-relaxed text-fg placeholder:text-fg-subtle disabled:opacity-60"
        />
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <AttachmentMenu />
            <button
              type="button"
              disabled={busy}
              onClick={openVideoGenerationModal}
              className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
              title="Generate video (OpenRouter) — opens setup modal"
            >
              Generate video
            </button>
            {attachments.length > 0 && (
              <span className="text-fg-muted">
                {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {queuedCount > 0 && (
              <>
                <span className="text-fg-muted">
                  {queuedCount} queued
                </span>
                <button
                  type="button"
                  className="rounded border border-border-soft px-2 py-0.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
                  onClick={() => clearPendingQueueOnly()}
                  title="Remove pending messages from the queue"
                >
                  Clear queue
                </button>
              </>
            )}
            <span className="truncate">{busy ? 'Sending…' : modelToolbarLabel}</span>
            {settings.voiceInputEnabled ? (
              <button
                type="button"
                disabled={busy}
                aria-pressed={voiceListening}
                aria-label={voiceListening ? 'Stop voice input' : 'Start voice input'}
                onClick={() => toggleVoiceInput()}
                className={
                  'rounded-md border px-2 py-1 text-xs ' +
                  (voiceListening
                    ? 'border-accent text-accent'
                    : 'border-border text-fg-muted hover:bg-bg-hover')
                }
              >
                {voiceListening ? 'Stop mic' : 'Mic'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!input.trim() && attachments.length === 0}
              aria-label="Send message to AI"
              onClick={() => {
                const v = input;
                setInput('');
                setShowSlashMenu(false);
                void dispatchUserInput(v);
              }}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-accent/25 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <VideoGenerationModal
        open={showVideoGenModal}
        onClose={() => setShowVideoGenModal(false)}
        onGenerate={(req) => {
          setShowVideoGenModal(false);
          void runOpenRouterVideoJob(req);
        }}
        busy={busy}
        settings={settings}
        models={models}
        freeModeEnabled={freeModeEnabled}
        initialPrompt={videoGenSeedPrompt}
      />

      <ComposerPanel
        open={showComposerPanel}
        onClose={() => setShowComposerPanel(false)}
        initialSession={taskCache?.composer ?? null}
        onPreviewImpact={(p) => {
          setInput(p);
          toast.info('Composer', 'Prompt inserted — press Ctrl+Enter to send.');
        }}
        onConfirmApply={(p) => {
          void submitChat(p);
          setShowComposerPanel(false);
        }}
        onSessionSnapshot={(snap) => void persistComposerSnapshot(snap)}
      />
      {showBrowserPanel ? <BrowserPanel onClose={() => setShowBrowserPanel(false)} /> : null}

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
  title,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
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
    <div className="ai-chrome-band flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-1.5 text-[11px] ds-transition">
      <div className="flex min-w-0 flex-1 items-center gap-2">
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
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
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
