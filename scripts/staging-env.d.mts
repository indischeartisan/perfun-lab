export function assertStagingBuildEnvironment(options?: {
  cwd?: string
  env?: Record<string, string | undefined>
}): { stagingRef: string }
