// ─────────────────────────────────────────────────────────────────────────────
// Shared benchmark data — identical inputs for all libraries
// ─────────────────────────────────────────────────────────────────────────────

/** Scenario 1: simple flat object (5 fields) — valid */
export const SIMPLE_VALID = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
  age: 30,
  active: true,
  tag: 'premium',
};

/** Scenario 1: simple flat object — all fields invalid */
export const SIMPLE_INVALID = {
  name: 'A',          // minLength(2) fail
  email: 'not-email', // isEmail fail
  age: -5,            // min(0) fail
  active: 'nope',     // isBoolean fail
  tag: 123,           // isString fail
};

/** Scenario 2: nested 3 levels — valid */
export const NESTED_VALID = {
  title: 'Order #1234',
  customer: {
    name: 'Bob Smith',
    email: 'bob@example.com',
    address: {
      street: '123 Main St',
      city: 'Seoul',
      zip: '06100',
    },
  },
  priority: 3,
};

/** Scenario 2: nested 3 levels — deep invalid */
export const NESTED_INVALID = {
  title: '',
  customer: {
    name: '',
    email: 'bad',
    address: {
      street: '',
      city: '',
      zip: 123,
    },
  },
  priority: -1,
};

/** Scenario 3: array of 1000 items — all valid */
export const ARRAY_VALID = {
  items: Array.from({ length: 1000 }, (_, i) => ({
    name: `Item ${i}`,
    value: i * 10,
  })),
};

/** Scenario 4: error collection — 10 fields, all invalid */
export const ERROR_ALL_FAIL = {
  f0: '', f1: '', f2: '', f3: '', f4: '',
  f5: '', f6: '', f7: '', f8: '', f9: '',
};
