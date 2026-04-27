import { test, expect } from '@playwright/experimental-ct-react';
import { PropertyInput } from '../property-input';

test('should render string input', async ({ mount, page }) => {
  const component = await mount(
    <div className="p-8 bg-zinc-900 w-[400px]">
      <PropertyInput
        value="initial value"
        kind="text"
        onChange={() => {}}
      />
    </div>
  );

  const input = component.locator('input[type="text"]');
  await expect(input).toHaveValue('initial value');
});

test('should render boolean input', async ({ mount }) => {
  const component = await mount(
    <div className="p-8 bg-zinc-900 w-[400px]">
      <PropertyInput
        value={false}
        kind="boolean"
        onChange={() => {}}
      />
    </div>
  );

  const checkbox = component.locator('input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();
});
