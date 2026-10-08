import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, runFixture, testInfo) => {
    // Every journey is test traffic. The shop tags its PostHog events
    // `synthetic: true` only when this flag is set before its scripts run, and
    // the detector scores only that cohort. Set here so no spec can forget it.
    await page.addInitScript(() => {
      window.__ACESO_SYNTHETIC__ = true;
    });
    const runId = process.env.ACESO_PREVIEW_RUN_ID;
    await page.addInitScript((previewRunId) => {
      window.__ACESO_PREVIEW_CONTEXT__ = { runId: previewRunId };
    }, runId);

    await runFixture(page);

    // Send a positive heartbeat only after the browser journey passed. The
    // verifier checks these properties in PostHog against the Vercel build.
    if (testInfo.status === "passed" && runId) {
      const expectedDeploymentId = process.env.ACESO_PREVIEW_DEPLOYMENT_ID;
      const expectedRelease = process.env.ACESO_PREVIEW_RELEASE;
      const context = await page.evaluate(() => window.__ACESO_BUILD_CONTEXT__);
      if (
        !context ||
        context.deploymentId !== expectedDeploymentId ||
        context.release !== expectedRelease ||
        context.environment !== "preview"
      ) {
        throw new Error("Browser build identity does not match the preview under test.");
      }
      // The event is sent from the test runner, not the page. Sent from the
      // page, the fixture waited for *any* PostHog response and the browser
      // could close before this event left it: 1 in 10 completion events
      // (4 in 10 on longer journeys) never reached PostHog. The build identity
      // above is still read from, and checked in, the browser.
      const posthogClient = await page.evaluate(() => {
        const client = window.posthog;
        if (!client || typeof client.get_distinct_id !== "function") return null;
        return {
          token: client.config?.token as string | undefined,
          apiHost: client.config?.api_host as string | undefined,
          distinctId: client.get_distinct_id(),
        };
      });
      if (!posthogClient?.token || !posthogClient.apiHost) {
        throw new Error("PostHog is not initialized; cannot emit preview completion evidence.");
      }
      const response = await page.request.post(
        `${posthogClient.apiHost.replace(/\/$/, "")}/i/v0/e/`,
        {
          data: {
            api_key: posthogClient.token,
            event: "aceso_preview_journey_completed",
            distinct_id: posthogClient.distinctId,
            timestamp: new Date().toISOString(),
            properties: {
              ...context,
              aceso_deployment_id: context.deploymentId,
              aceso_release: context.release,
              aceso_environment: context.environment,
              aceso_preview_run_id: runId,
              synthetic: true,
            },
          },
          timeout: 15000,
        }
      );
      if (!response.ok()) {
        throw new Error(`PostHog rejected the preview completion event (${response.status()}).`);
      }
    }
  },
});

export { expect };
