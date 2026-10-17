// Optional browser drive (D-23, no new dependency): ACCEPTANCE S1 end to end
// through the real UI in demo mode ("Try as Role"), as 7 people in one
// browser session, plus S9 emergency, S3 blocker and S6 cancel. Demo data
// lives only in the page, so nothing reaches Firestore (D-19).
// Needs a Playwright install outside the repo (cloud sessions have one) and
// the dev server on :3000.
//   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright node scripts/mvp/ui-drive.cjs <outDir>
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const out = process.argv[2] || '.';
const PHOTO = path.join(__dirname, 'ui-fixtures', 'photo.jpg');
const PDF = path.join(__dirname, 'ui-fixtures', 'licence.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { localStorage.setItem('aiec_first_launch_flag', 'false'); localStorage.setItem('aiec_app_version', '1.0.1'); });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  let n = 0;
  const shot = async (name, full = true) => { n++; await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: full }); };
  const btn = (name, exact = false) => page.getByRole('button', { name, exact });
  const step = async (label, fn) => {
    try { await fn(); console.log('OK  ' + label); }
    catch (e) { console.log('FAIL ' + label + ' — ' + String(e).split('\n')[0]); await shot('FAIL-' + label.replace(/\W+/g, '_')); throw e; }
  };
  const login = async (who) => {
    await page.waitForTimeout(500);
    const signOut = page.getByRole('button', { name: /^(Sign out|Log Out)$/ });
    for (let i = 0; i < await signOut.count(); i++) {
      if (await signOut.nth(i).isVisible()) { await signOut.nth(i).click(); await page.waitForTimeout(900); break; }
    }
    const ack = page.getByRole('button', { name: /Acknowledge & Continue/ });
    if (await ack.count()) { await ack.first().click(); await page.waitForTimeout(400); }
    await page.getByRole('button', { name: /TRY DEMO MODE/ }).click().catch(() => {});
    await page.getByRole('button', { name: new RegExp(who) }).first().click();
    await page.waitForTimeout(1500);
  };
  const tab = async (label) => {
    await page.evaluate(id => window.dispatchEvent(new CustomEvent('aiec_switch_tab', { detail: id })), label);
    await page.waitForTimeout(1200);
  };
  const openFirstOrder = async () => {
    await tab('MvpOrders');
    await page.locator('button:has(span.font-mono)').first().click();
    await page.waitForTimeout(1200);
  };
  const upload = async (labelRe, file = PHOTO, index = 0) => {
    const labels = page.locator('label', { hasText: labelRe });
    const id = await labels.nth(index).getAttribute('for');
    await page.setInputFiles(`#${id}`, file);
    await page.waitForTimeout(700);
  };
  const ok = async (text) => { await page.getByText(text).first().waitFor({ timeout: 8000 }); };

  try {
    await step('sales creates a lead', async () => {
      await login('Sales Sameer');
      await tab('MvpLeads');
      await page.getByRole('tab', { name: 'New lead' }).click();
      await page.getByLabel('Customer name', { exact: true }).fill('ABC Builders');
      await page.getByLabel('Phone', { exact: true }).fill('9800000001');
      await page.getByLabel('Location / site address', { exact: true }).fill('Baner, Pune');
      await page.getByLabel('Floors', { exact: true }).fill('8');
      await upload(/Site photo/);
      await page.getByRole('checkbox').check();
      await shot('sales-new-lead');
      await btn('Save lead').click();
      await ok('ABC Builders');
    });
    await step('sales qualifies the lead', async () => {
      await btn('Qualify → create order').click();
      await ok('Open order');
      await shot('sales-qualified');
    });
    await step('admin dashboard', async () => {
      await login('Master Admin');
      await ok('Needs attention');
      await shot('admin-dashboard');
    });
    await step('admin assigns the surveyor', async () => {
      await openFirstOrder();
      await shot('order-view-qualified');
      await btn('Assign surveyor').click();
      await ok('Do the site survey');
    });
    await step('surveyor submits the survey', async () => {
      await login('Amit Sharma');
      await ok('Do the site survey');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('surveyor-my-work-phone');
      await page.getByText('Do the site survey').first().click();
      await page.waitForTimeout(1200);
      await page.getByLabel('Stops', { exact: true }).fill('8');
      await page.getByLabel('Capacity', { exact: true }).fill('8 persons');
      await page.getByLabel('Shaft width (mm)', { exact: true }).fill('1800');
      await page.getByLabel('Shaft depth (mm)', { exact: true }).fill('1700');
      await page.getByLabel('Pit (mm)', { exact: true }).fill('1500');
      await page.getByLabel('Headroom (mm)', { exact: true }).fill('4200');
      await page.getByLabel('Power', { exact: true }).fill('3-phase available');
      await upload(/Add photo/);
      await upload(/Add photo/);
      await shot('surveyor-survey-form-phone');
      await btn('Submit').click();
      await ok('Survey: feasible');
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await step('admin prepares and sends the quote', async () => {
      await login('Master Admin');
      await openFirstOrder();
      await page.getByLabel('Base lift (₹, excl. tax)', { exact: true }).fill('780000');
      await page.getByLabel('Installation (₹)', { exact: true }).fill('140000');
      await page.getByLabel('Freight (₹)', { exact: true }).fill('50000');
      await page.getByLabel('Other charges (₹)', { exact: true }).fill('30000');
      await page.getByLabel(/GST rate/).fill('18');
      await page.getByLabel('Estimated cost (₹, Admin only)', { exact: true }).fill('800000');
      await shot('admin-quote-builder');
      await btn('Prepare quote').click();
      await btn('Send to customer').click();
      await ok('Quotation sent');
    });
    await step('customer accepts the quote and submits UTR', async () => {
      await login('Rohan Deshmukh');
      await tab('MvpOrders');
      await page.locator('select:has(option:text("Choose an order"))').selectOption({ index: 1 });
      await page.waitForTimeout(1200);
      await page.locator('button:has(span.font-mono)').first().click();
      await page.waitForTimeout(1200);
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('customer-quote-phone');
      await btn('Accept quote').click();
      await ok('Quote accepted');
      await page.getByPlaceholder('UTR / reference').first().fill('TEST123');
      await btn('Submit payment proof').first().click();
      await ok('Payment proof: Booking token');
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await step('admin verifies the token and raises the PO', async () => {
      await login('Master Admin');
      await openFirstOrder();
      await btn('Verify & record payment').first().click();
      await ok('Booking token: paid');
      await page.getByLabel('Supplier name', { exact: true }).fill('Sahyadri Lift Components');
      await page.getByLabel('PO amount (₹)', { exact: true }).fill('600000');
      await btn('Raise PO').click();
      await page.waitForTimeout(1000);
    });
    await step('customer confirms site readiness', async () => {
      await login('Rohan Deshmukh');
      await tab('MvpOrders');
      await page.locator('select:has(option:text("Choose an order"))').selectOption({ index: 1 });
      await page.waitForTimeout(1000);
      await page.locator('button:has(span.font-mono)').first().click();
      await page.waitForTimeout(1200);
      await upload(/Add photo/);
      await upload(/Add photo/);
      await btn('My site is ready').click();
      await ok('Done: Get the site ready');
    });
    await step('admin confirms site, records delivery payment, marks material received', async () => {
      await login('Master Admin');
      await openFirstOrder();
      await btn('Confirm site is ready').click();
      await ok('Track delivery and mark material received');
      await btn('Verify & record payment').first().click();
      await ok('Delivery payment: paid');
      await upload(/Photo of material at site/);
      await btn('Mark material received').click();
      await ok('Install the lift');
    });
    await step('technician installs (START, CHECK IN, 11 items, COMPLETE)', async () => {
      await login('Rajesh Patel');
      await page.setViewportSize({ width: 390, height: 844 });
      await ok('Install the lift');
      await page.getByText('Install the lift').first().click();
      await page.waitForTimeout(1200);
      await btn('START', true).click();
      await page.waitForTimeout(800);
      await btn('CHECK IN', true).click();
      await page.waitForTimeout(800);
      for (let i = 0; i < 11; i++) {
        await page.getByRole('button', { name: /mark done/ }).first().click();
        await page.waitForTimeout(350);
      }
      await shot('technician-checklist-phone');
      await btn('COMPLETE', true).click();
      await ok('Inspect the installation');
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await step('QC passes', async () => {
      await login('QC Meera');
      await ok('Inspect the installation');
      await page.getByText('Inspect the installation').first().click();
      await page.waitForTimeout(1200);
      await page.getByLabel('Test results', { exact: true }).fill('Load test OK, safety gear OK');
      await btn('PASS', true).click();
      await ok('QC PASS');
    });
    await step('admin: final payment, licence, customer approval, handover', async () => {
      await login('Master Admin');
      await openFirstOrder();
      await btn('Verify & record payment').first().click();
      await ok('Final handover payment: paid');
      // Licence task panel (first compliance row is the licence)
      await upload(/Attach file/, PDF, 0);
      await page.getByLabel('Lift licence status', { exact: true }).first().selectOption('DONE');
      await btn('Save').first().click();
      await ok('Document done: lift licence');
      await btn('Record customer approval (on behalf)').click();
      await ok('Customer approved the handover');
      await page.getByLabel('Final test', { exact: true }).fill('All functions verified with the customer');
      await btn('Complete handover').click();
      await ok('Handover completed');
      await shot('order-view-completed');
    });
    await step('S9 emergency: on-call set, customer raises, technician resolves', async () => {
      await login('Master Admin');
      await tab('MvpSettings');
      await page.getByLabel(/On-call technician today/).selectOption({ label: 'Rajesh Patel' });
      await page.getByLabel(/Emergency phone number/).fill('+91 90000 11122');
      await btn('Save', true).first().click();
      await page.waitForTimeout(800);
      await login('Rohan Deshmukh');
      await tab('MvpOrders');
      await page.locator('select:has(option:text("Choose an order"))').selectOption({ index: 1 });
      await page.waitForTimeout(1000);
      await page.getByRole('combobox', { name: 'Filter' }).selectOption('ALL');
      await page.waitForTimeout(800);
      await page.locator('button:has(span.font-mono)').first().click();
      await page.waitForTimeout(1200);
      await ok('+91 90000 11122');
      await btn('EMERGENCY', true).click();
      await btn('Send emergency alert').click();
      await ok('EMERGENCY: Lift stuck between floors');
      await login('Rajesh Patel');
      await ok('EMERGENCY: respond now');
      await shot('technician-emergency-my-work');
      await page.getByText('EMERGENCY: respond now').first().click();
      await page.waitForTimeout(1200);
      await btn('Acknowledge — I am on it').click();
      await page.waitForTimeout(800);
      await page.getByLabel('Resolution note', { exact: true }).fill('Passengers released, door sensor reset');
      await btn('Resolve', true).click();
      await ok('Emergency resolved');
    });
    await step('S3 technician blocker raised and resolved; S6 admin cancels another order', async () => {
      await login('Sales Sameer');
      await tab('MvpLeads');
      await page.getByRole('tab', { name: 'New lead' }).click();
      await page.getByLabel('Customer name', { exact: true }).fill('XYZ Homes');
      await page.getByLabel('Phone', { exact: true }).fill('9800000002');
      await page.getByLabel('Location / site address', { exact: true }).fill('Wakad, Pune');
      await page.getByRole('checkbox').check();
      await btn('Save lead').click();
      await ok('XYZ Homes');
      await btn('Qualify → create order').first().click();
      await page.waitForTimeout(1000);
      await login('Master Admin');
      await tab('MvpOrders');
      await page.locator('button:has(span.font-mono)', { hasText: 'XYZ Homes' }).first().click();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Raise blocker…' }).click();
      await page.getByLabel('Description', { exact: true }).fill('Customer travelling, survey date not confirmed');
      await page.locator('select:has(option[value="CUSTOMER_NOT_READY"])').last().selectOption('CUSTOMER_NOT_READY');
      await btn('BLOCKED', true).click();
      await ok('Blocker: customer not ready');
      await page.getByPlaceholder('Resolution note').fill('Customer confirmed a date');
      await btn('Resolve', true).click();
      await ok('Blocker resolved');
      await page.getByLabel('Reason (required for hold, cancel and override)', { exact: true }).fill('Customer chose another vendor');
      page.once('dialog', d => d.accept());
      await btn('Cancel order').click();
      await ok('CANCELLED');
      await shot('order-cancelled');
    });
    await step('dashboard, reports and customer view at the end', async () => {
      await tab('MvpDashboard');
      await shot('admin-dashboard-end');
      await tab('MvpReports');
      await shot('admin-reports');
      await login('Rohan Deshmukh');
      await tab('MvpOrders');
      await page.locator('select:has(option:text("Choose an order"))').selectOption({ index: 1 });
      await page.waitForTimeout(1000);
      await page.getByRole('combobox', { name: 'Filter' }).selectOption('ALL');
      await page.waitForTimeout(800);
      await page.locator('button:has(span.font-mono)').first().click();
      await page.waitForTimeout(1200);
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('customer-completed-phone');
      const bodyText = await page.locator('body').innerText();
      console.log(/Estimated cost|estimatedCost|margin/i.test(bodyText) ? 'FAIL customer sees cost/margin text' : 'OK  customer view has no cost or margin');
    });
  } catch (e) {
    process.exitCode = 1;
  } finally {
    console.log('page errors:', errors.filter(e => !/Firebase|firestore|favicon|manifest|maps/i.test(e)).slice(0, 8));
    await browser.close();
  }
})();
