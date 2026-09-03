/** True when demo login shortcuts should render in the client bundle. */
export function isDemoLoginsEnabledByBuild(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEMO_LOGINS === "1" ||
    import.meta.env.VITE_DEMO_LOGINS === "true"
  );
}
