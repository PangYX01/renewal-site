export const pricing = {
  testMode: false,
  unitPrice: 1,
  currency: 'RM',
  durations: [
    { years: 1, label: 'Renew for 1 Year', price: 120, default: false },
    { years: 2, label: 'Renew for 2 Years - Save RM30', price: 210, default: true },
    { years: 3, label: 'Renew for 3 Years - Save RM60', price: 300, default: false },
    { years: 4, label: 'Renew for 4 Years - Save RM90', price: 390, default: false },
    { years: 5, label: 'Renew for 5 Years - Save RM120', price: 480, default: false }
  ],
  branch: {
    rate: 5,
    multiply_by_years: true,
    formula: [
      { operator: 'start', source: 'branches', value: 0 },
      { operator: 'multiply', source: 'renewal_years', value: 0 },
      { operator: 'multiply', source: 'branch_rate', value: 0 }
    ],
    item_name: 'Branch Renewal Fee'
  },
  addons: {
    compound: { price: 120, default_checked: true },
    info: { price: 30, default_checked: true },
    colored: { price: 50, default_checked: false }
  },
  formId: 1
};
