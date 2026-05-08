import { lazy, Suspense } from 'react';
import { useApp } from '../store/appStore';
import ToolApprovalModal from './ToolApprovalModal';

const SettingsModal = lazy(() => import('./SettingsModal'));
const ModelPicker = lazy(() => import('./ModelPicker'));
const QuickOpen = lazy(() => import('./QuickOpen'));
const RulesModal = lazy(() => import('./RulesModal'));
const TasksModal = lazy(() => import('./TasksModal'));
const CommandPalette = lazy(() => import('./CommandPalette'));
const FindReplaceDialog = lazy(() =>
  import('./FindReplaceDialog').then((m) => ({ default: m.FindReplaceDialog })),
);
const RoadmapModal = lazy(() => import('./RoadmapModal'));
const StatsModal = lazy(() => import('./StatsModal'));
const BenchmarkModal = lazy(() => import('./BenchmarkModal'));
const AccountModal = lazy(() => import('./AccountModal'));
const DiffPreview = lazy(() => import('./DiffPreview'));
const MultiDiffPreview = lazy(() => import('./MultiDiffPreview'));
const CrashRecoveryModal = lazy(() =>
  import('./CrashRecoveryModal').then((m) => ({ default: m.CrashRecoveryModal })),
);
const WelcomeTour = lazy(() => import('./WelcomeTour'));

/** Defers modal bundles until first open — smaller initial JS, faster IDE cold start. */
export function LazyModalLayer({
  showWelcomeTour,
  onWelcomeTourDone,
}: {
  showWelcomeTour: boolean;
  onWelcomeTourDone: () => void;
}) {
  const showSettings = useApp((s) => s.showSettings);
  const showModelPicker = useApp((s) => s.showModelPicker);
  const showQuickOpen = useApp((s) => s.showQuickOpen);
  const showRules = useApp((s) => s.showRules);
  const showTasks = useApp((s) => s.showTasks);
  const showCommandPalette = useApp((s) => s.showCommandPalette);
  const showFindReplace = useApp((s) => s.showFindReplace);
  const showRoadmap = useApp((s) => s.showRoadmap);
  const showUsageStats = useApp((s) => s.showUsageStats);
  const showBenchmark = useApp((s) => s.showBenchmark);
  const showAccountModal = useApp((s) => s.showAccountModal);
  const crashDetected = useApp((s) => s.crashDetected);
  const pendingDiff = useApp((s) => s.pendingDiff);
  const pendingMultiDiff = useApp((s) => s.pendingMultiDiff);

  return (
    <>
      <ToolApprovalModal />
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )}
      {showModelPicker && (
        <Suspense fallback={null}>
          <ModelPicker />
        </Suspense>
      )}
      {showQuickOpen && (
        <Suspense fallback={null}>
          <QuickOpen />
        </Suspense>
      )}
      {showRules && (
        <Suspense fallback={null}>
          <RulesModal />
        </Suspense>
      )}
      {showTasks && (
        <Suspense fallback={null}>
          <TasksModal />
        </Suspense>
      )}
      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {showFindReplace && (
        <Suspense fallback={null}>
          <FindReplaceDialog />
        </Suspense>
      )}
      {showRoadmap && (
        <Suspense fallback={null}>
          <RoadmapModal />
        </Suspense>
      )}
      {showUsageStats && (
        <Suspense fallback={null}>
          <StatsModal />
        </Suspense>
      )}
      {showBenchmark && (
        <Suspense fallback={null}>
          <BenchmarkModal />
        </Suspense>
      )}
      {showAccountModal && (
        <Suspense fallback={null}>
          <AccountModal />
        </Suspense>
      )}
      {crashDetected && (
        <Suspense fallback={null}>
          <CrashRecoveryModal />
        </Suspense>
      )}
      {pendingDiff && (
        <Suspense fallback={null}>
          <DiffPreview />
        </Suspense>
      )}
      {pendingMultiDiff && pendingMultiDiff.length > 0 && (
        <Suspense fallback={null}>
          <MultiDiffPreview />
        </Suspense>
      )}
      {showWelcomeTour && (
        <Suspense fallback={null}>
          <WelcomeTour onDone={onWelcomeTourDone} />
        </Suspense>
      )}
    </>
  );
}
