export const RUN_REPORT_LIMITS = Object.freeze({
  storageBytes: 3 * 1024 * 1024,
  actions: 10_000,
  successfulActions: 10_000,
  redCommands: 1_000,
  actionSuccessfulCommands: 1_000,
  actionRedCommands: 100,
  traceCodeUnits: 20_000,
  cwdCodeUnits: 4_096,
  modeCodeUnits: 100,
})
