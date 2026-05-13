export type SelectionMode = 'first' | 'random';

export type RuntimeConfig = {
  selectionMode: SelectionMode;
  targetRevenueCenter?: string;
  targetMenu?: string;
  targetItem?: string;
  kitchenMessage: string;
  runMultiItemOrder: boolean;
  runPaymentFailureTest: boolean;
  runSearchTest: boolean;
  searchItemName?: string;
  invalidFirstName?: string;
  invalidRoom?: string;
  invalidPin?: string;
};

export function getRuntimeConfig(): RuntimeConfig {
  return {
    selectionMode: selectionModeFromEnv(),
    targetRevenueCenter: optionalEnv('TARGET_REVENUE_CENTER'),
    targetMenu: optionalEnv('TARGET_MENU'),
    targetItem: optionalEnv('TARGET_ITEM'),
    kitchenMessage: process.env.KITCHEN_MESSAGE || 'Servingintel test. Please do not make!',
    runMultiItemOrder: booleanEnv('RUN_MULTI_ITEM_ORDER'),
    runPaymentFailureTest: booleanEnv('RUN_PAYMENT_FAILURE_TEST'),
    runSearchTest: booleanEnv('RUN_SEARCH_TEST'),
    searchItemName: optionalEnv('SEARCH_ITEM_NAME'),
    invalidFirstName: optionalEnv('INVALID_RESIDENT_FIRST_NAME'),
    invalidRoom: optionalEnv('INVALID_RESIDENT_ROOM'),
    invalidPin: optionalEnv('INVALID_RESIDENT_PIN'),
  };
}

export function residentCredentials() {
  return {
    firstName: requiredEnv('RESIDENT_FIRST_NAME'),
    room: requiredEnv('RESIDENT_ROOM'),
    pin: requiredEnv('RESIDENT_PIN'),
  };
}

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function booleanEnv(name: string) {
  return /^(1|true|yes)$/i.test(process.env[name] || '');
}

function selectionModeFromEnv(): SelectionMode {
  const value = (process.env.SELECTION_MODE || 'first').toLowerCase();
  if (value === 'random') {
    return 'random';
  }
  return 'first';
}
