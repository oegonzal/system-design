import { expect, type Locator, type Page } from '@playwright/test';

/** The dock's Brief tab: per criterion, the claim in the author's words, the components that hold it and the flow it traces. */
export class BriefPanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Brief' });
  }

  row(criterionId: string): Locator {
    return this.page.getByTestId(`binding-row-${criterionId}`);
  }

  claim(criterionId: string): Locator {
    return this.page.getByTestId(`binding-claim-${criterionId}`);
  }

  node(criterionId: string, nodeId: string): Locator {
    return this.page.getByTestId(`binding-node-${criterionId}-${nodeId}`);
  }

  /** The claim in the author's words — creates the binding on first use. */
  async setClaim(criterionId: string, claim: string): Promise<void> {
    await this.tab.click();
    await this.claim(criterionId).fill(claim);
  }

  /** Tick one of the components on the canvas as holding the criterion. */
  async toggleNode(criterionId: string, nodeId: string): Promise<void> {
    await this.tab.click();
    await this.node(criterionId, nodeId).click();
  }

  /** The row's chip: `empty` → `incomplete` → `bound` (claim + at least one component). */
  async expectState(criterionId: string, state: 'empty' | 'incomplete' | 'bound'): Promise<void> {
    await expect(this.page.getByTestId(`binding-state-${criterionId}`)).toHaveAttribute(
      'data-state',
      state,
    );
  }

  /** The tracer is folded away until a path exists; open it once per binding. */
  async openTracer(criterionId: string): Promise<void> {
    await this.tab.click();
    await this.page.getByTestId(`flow-open-${criterionId}`).click();
  }

  /**
   * Trace a request by taking the offered hops in order.
   *
   * Note what this does NOT do: click edges on the canvas. The tracer offers
   * only edges that continue the walk, as buttons in the dock — so a broken
   * path is unrepresentable, and this sidesteps the bezier hit-target problem
   * `selectEdge` has to work around.
   */
  async trace(criterionId: string, edgeIds: readonly string[]): Promise<void> {
    await this.tab.click();
    for (const edgeId of edgeIds) {
      await this.page.getByTestId(`flow-hop-${criterionId}-${edgeId}`).click();
    }
  }

  /** Show the criterion's path on the canvas, or hide it. */
  async toggleFocus(criterionId: string): Promise<void> {
    await this.page.getByTestId(`flow-focus-${criterionId}`).click();
  }

  async expectFocused(criterionId: string, pressed: boolean): Promise<void> {
    await expect(this.page.getByTestId(`flow-focus-${criterionId}`)).toHaveAttribute(
      'aria-pressed',
      String(pressed),
    );
  }

  async expectTraced(criterionId: string, hops: number): Promise<void> {
    await expect(this.page.getByTestId(`flow-status-${criterionId}`)).toContainText(
      `Traced · ${hops} ${hops === 1 ? 'hop' : 'hops'}`,
    );
  }
}
