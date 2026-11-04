export const PRO_PLANS = [
  { months: 1, price: 79 },
  { months: 3, price: 219 },
  { months: 6, price: 399 },
] as const;

export const PRO_PLAN_SUMMARY = PRO_PLANS.map(plan =>
  `₱${plan.price} / ${plan.months} ${plan.months === 1 ? "month" : "months"}`,
).join(" · ");

export const PRO_CONTACT_URL = "https://www.instagram.com/revithoroughly/";
