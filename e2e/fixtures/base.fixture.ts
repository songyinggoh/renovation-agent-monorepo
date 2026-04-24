import { test as base } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';
import { SessionPage } from '../page-objects/session.page';
import { PaymentPage } from '../page-objects/payment.page';
import { ApiHelper } from '../helpers/api-helper';

type Fixtures = {
  dashboardPage: DashboardPage;
  sessionPage: SessionPage;
  paymentPage: PaymentPage;
  api: ApiHelper;
};

export const test = base.extend<Fixtures>({
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  sessionPage: async ({ page }, use) => {
    await use(new SessionPage(page));
  },
  paymentPage: async ({ page }, use) => {
    await use(new PaymentPage(page));
  },
  api: async ({}, use) => {
    await use(new ApiHelper('http://localhost:3000'));
  },
});

export { expect } from '@playwright/test';
