import { bookingDuration } from './booking-duration.js';
import { normalizeMenus, sampleMenus } from './food-menus.js';
export const EVENT_TYPES = ['Wedding', 'Reception', 'Engagement / Sagai', 'Tilak', 'Roka', 'Haldi', 'Mehendi', 'Sangeet', 'Anniversary', 'Mundan', 'Janeu / Upanayan', 'Birthday', 'Seminar', 'Conference', 'Corporate event', 'Other'];
export const PLATE_TYPES = ['Vegetarian', 'Jain / No onion-garlic', 'Non-vegetarian', 'Mixed menu'];
export const PLAN_MODES = [
  { value: 'venue', label: 'Venue only', description: 'Hall rental only. Food is not included.' },
  { value: 'plate', label: 'Per plate · venue included', description: 'Food billing with optional minimum guarantee or minimum spend. No separate hall rent.' },
  { value: 'combined', label: 'Venue + per plate', description: 'Hall rental plus catering for the billed plate count.' },
  { value: 'fixed', label: 'Fixed package', description: 'A single package price for the venue and listed inclusions.' },
];
export const RATE_KEYS = { 'Vegetarian': 'vegRate', 'Jain / No onion-garlic': 'jainRate', 'Non-vegetarian': 'nonVegRate', 'Mixed menu': 'mixedRate' };
export const ADDON_UNITS = ['per event', 'per guest', 'per room-night', 'per hour', 'per item'];
export const ADDON_CATEGORIES = ['Decoration', 'Catering', 'Entertainment', 'Accommodation', 'Utilities', 'Guest services', 'Other'];
export const MAX_SERVICE_FEATURES = 20;
export const MAX_FEATURE_LENGTH = 160;
export function normalizeFeatures(value = []) {
  if (!Array.isArray(value)) throw Error('Inclusions must be a list of text items.');
  if (value.length > MAX_SERVICE_FEATURES) throw Error(`Add up to ${MAX_SERVICE_FEATURES} inclusions.`);
  const seen = new Set();
  return value.reduce((result, feature) => {
    if (typeof feature !== 'string') throw Error('Each inclusion must be text.');
    const text = feature.replace(/\s+/g, ' ').trim();
    if (text.length > MAX_FEATURE_LENGTH) throw Error(`Each inclusion must be ${MAX_FEATURE_LENGTH} characters or fewer.`);
    const key = text.toLocaleLowerCase('en-IN');
    if (text && !seen.has(key)) { seen.add(key); result.push(text); }
    return result;
  }, []);
}

export const defaultPlans = [
  { name: 'Your venue, your way', mode: 'venue', description: 'An elegant space for your celebration. Choose the venue and only the services you need. Food is not included.', minimumPlates: 0, fixedPrice: 0, vegRate: 0, jainRate: 0, nonVegRate: 0, mixedRate: 0, advancePercent: 30, taxRate: 0, status: 'Active' },
  { name: 'Shubh Bhoj', mode: 'plate', description: 'Venue included with a welcome drink, 2 starters, 3 mains, dal, rice, breads, salad and 2 desserts. Menu subject to confirmation.', minimumPlates: 150, fixedPrice: 0, vegRate: 850, jainRate: 950, nonVegRate: 1150, mixedRate: 1050, advancePercent: 30, taxRate: 0, status: 'Active' },
  { name: 'Shaadi Celebration', mode: 'combined', description: 'Hall rental plus a premium catered menu. Add a mandap, baraat welcome or a live food counter to make it your own.', minimumPlates: 100, fixedPrice: 0, vegRate: 650, jainRate: 750, nonVegRate: 950, mixedRate: 850, advancePercent: 30, taxRate: 0, status: 'Active' },
  { name: 'Sagai & Sangeet', mode: 'fixed', description: 'Venue, basic stage décor, sound system and vegetarian dinner for up to 150 guests. Extra services are charged separately.', minimumPlates: 0, maxGuests: 150, fixedPrice: 175000, vegRate: 0, jainRate: 0, nonVegRate: 0, mixedRate: 0, advancePercent: 40, taxRate: 0, status: 'Active' },
].map((plan,index) => ({...plan, menus: index===0?[]:index===3?[sampleMenus[0]]:sampleMenus, terms:''}));
export const defaultAddons = [
  { name: 'Mandap & stage decoration', category: 'Decoration', price: 35000, unit: 'per event', description: 'Floral mandap, stage backdrop and entrance styling.' },
  { name: 'Baraat welcome', category: 'Guest services', price: 8500, unit: 'per event', description: 'Welcome refreshments, garlands and guest coordination.' },
  { name: 'DJ & sound system', category: 'Entertainment', price: 18000, unit: 'per event', description: 'DJ console, speakers and operator. Subject to local timing and noise rules.' },
  { name: 'Live chaat counter', category: 'Catering', price: 120, unit: 'per guest', description: 'Chaat and golgappa service. Set the number of servings required.' },
  { name: 'Guest room', category: 'Accommodation', price: 2500, unit: 'per room-night', description: 'One room for one night. Multiply rooms by nights when setting quantity.' },
  { name: 'Generator & power backup', category: 'Utilities', price: 1800, unit: 'per hour', description: 'Backup power with an operator. Enter the required number of hours.' },
  { name: 'Photography & video', category: 'Other', price: 45000, unit: 'per event', description: 'Event photo and video coverage; final deliverables confirmed with the vendor.' },
  { name: 'Valet & parking support', category: 'Guest services', price: 6000, unit: 'per event', description: 'Parking assistance and vehicle coordination.' },
].map((item, i) => ({ ...item, status: 'Active', features: [['Floral mandap setup', 'Decorated stage backdrop', 'Entrance styling', 'Setup and dismantling'], ['Welcome refreshments', 'Garland distribution', 'Guest arrival coordination'], ['DJ console and sound system', 'On-site DJ operator', 'Setup and sound check'], ['Chaat and golgappa counter', 'Serving staff', 'Plates and serving essentials'], ['One guest room for one night', 'Fresh linen and towels', 'Check-in assistance'], ['Generator for the selected hours', 'On-site operator', 'Power connection setup'], ['Event photography', 'Event video coverage', 'Delivery scope confirmed with the vendor'], ['Parking assistance', 'Vehicle arrival coordination', 'Guest pickup support']][i] }));

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function number(value, label, { min = 0, max = 100000000, integer = false } = {}) {
  if (value === '' || value === null || value === undefined || !['number', 'string'].includes(typeof value)) throw Error(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw Error(`${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`);
  return round(n);
}

// Pure calculator shared by the UI and API. Prices come from the tenant catalog or
// a previously saved snapshot, never from client-supplied unit rates or totals.
export function priceBooking(input, { plans = [], addons = [], hall, previous, isClient = false }) {
  if (!input.planId) return null; // Existing manual-price bookings remain unchanged.
  if (!hall) throw Error('Select a marriage hall before choosing a plan.');
  const saved = previous?.quote;
  const samePlan = previous?.planId === input.planId && saved?.plan?.id === input.planId;
  const plan = samePlan ? saved.plan : plans.find(p => p.id === input.planId && p.status === 'Active');
  if (!plan) throw Error('This booking plan is not available in your workspace.');
  if (!PLAN_MODES.some(m => m.value === plan.mode)) throw Error('The selected plan has an invalid pricing mode.');
  const perPlate = ['plate', 'combined'].includes(plan.mode);
  const menus = normalizeMenus(plan.menus);
  const offered = menus.length ? menus.map(menu=>menu.plateType) : PLATE_TYPES;
  const guests = number(input.guests, 'Guest count', { min: 1, max: Number(hall.capacity), integer: true });
  if (plan.mode === 'fixed' && plan.maxGuests && guests > plan.maxGuests) throw Error(`This fixed package covers up to ${plan.maxGuests} guests. Choose a different plan or lower the guest count.`);
  const version = saved?.version===2 || isClient || input.pricingVersion===2 || (!saved && input.guaranteedPlates===undefined) ? 2 : 1;
  const duration = bookingDuration(input);
  const venueRates = saved && previous?.hallId===hall.id ? (saved.venueRates || {price:saved.venueRate}) : Object.fromEntries(['price','morningPrice','afternoonPrice','eveningPrice'].map(key=>[key,hall[key]??hall.price]));
  const rule = (plan.eventRates||[]).find(rule=>rule.eventType===input.type)||{};
  const configuredRental = rule.venueRate ?? plan.venueRate ?? venueRates[duration.rateKey] ?? venueRates.price;
  const venueRate = number(configuredRental, 'Venue rate');
  const venueAmount = ['venue', 'combined'].includes(plan.mode) ? round(venueRate * duration.rentalUnits) : 0;
  if(perPlate && Number(plan.minimumPlates||0)>Number(hall.capacity))throw Error(`This model requires ${plan.minimumPlates} guaranteed guests, above this hall’s capacity of ${hall.capacity}. Choose a different hall or model.`);
  const guaranteedPlates = perPlate ? number(input.guaranteedPlates ?? plan.minimumPlates ?? 0, 'Minimum guaranteed guests', { min: version===1?Math.max(1,Number(plan.minimumPlates||1)):Number(plan.minimumPlates||0), max: Number(hall.capacity), integer: true }) : 0;
  const actualGuests = perPlate && version===2 && !isClient && input.actualGuests!==undefined && input.actualGuests!==null && input.actualGuests!=='' ? number(input.actualGuests,'Actual served guests',{max:Number(hall.capacity),integer:true}) : null;
  const attendance = actualGuests ?? guests;
  const extraPlates = perPlate ? version===2 ? Math.max(0,attendance-guaranteedPlates) : number(input.extraPlates ?? 0, 'Extra plates', { max: Number(hall.capacity), integer: true }) : 0;
  const billedPlates = perPlate ? guaranteedPlates + extraPlates : 0;
  if (billedPlates > hall.capacity) throw Error(`Billable plates cannot exceed the hall capacity of ${hall.capacity}.`);
  const plateType = perPlate ? input.plateType : plan.mode==='fixed'&&menus.length ? (input.plateType&&input.plateType!=='Not included'?input.plateType:menus[0].plateType) : 'Not included';
  if ((perPlate || plan.mode==='fixed'&&menus.length) && !offered.includes(plateType)) throw Error('Choose a meal type offered by this pricing model.');
  const selectedMenu = menus.find(menu=>menu.plateType===plateType) || null;
  const plateRate = perPlate ? number(rule[RATE_KEYS[plateType]] ?? plan[RATE_KEYS[plateType]], 'Plate rate', { min: 1 }) : 0;
  const foodBase = round(billedPlates * plateRate);
  const minimumFoodValue = perPlate ? number(plan.minimumFoodValue ?? 0,'Minimum food billing') : 0;
  const minimumFoodTopUp = perPlate ? round(Math.max(0,minimumFoodValue-foodBase)) : 0;
  const cateringAmount = round(foodBase+minimumFoodTopUp);
  const packageAmount = plan.mode === 'fixed' ? number(rule.fixedPrice ?? plan.fixedPrice, 'Package price', { min: 1 }) : 0;
  if (!Array.isArray(input.addOns ?? [])) throw Error('Choose valid add-on services.');
  if ((input.addOns || []).length > 30) throw Error('A booking can have at most 30 add-on services.');
  const used = new Set();
  const addonLines = (input.addOns || []).map(selection => {
    if (!selection || typeof selection.id !== 'string' || used.has(selection.id)) throw Error('Each add-on service can be selected only once.');
    used.add(selection.id);
    const snapshot = saved?.addonLines?.find(line => line.id === selection.id);
    const service = snapshot || addons.find(a => a.id === selection.id && a.status === 'Active');
    if (!service) throw Error('One of the selected add-ons is no longer available in your workspace.');
    const quantityMode = version===2 && service.unit==='per guest' && selection.quantityMode==='guests' ? 'guests' : 'manual';
    const quantity = quantityMode==='guests' ? attendance : number(selection.quantity, 'Add-on quantity', { min: 1, max: 10000, integer: true });
    const rate = number(snapshot ? snapshot.rate : service.price, 'Add-on rate');
    return { id: service.id, name: service.name, unit: service.unit, rate, quantity, quantityMode, amount: round(rate * quantity), features: normalizeFeatures(service.features) };
  });
  const addonAmount = round(addonLines.reduce((sum, line) => sum + line.amount, 0));
  const subtotal = round(venueAmount + cateringAmount + packageAmount + addonAmount);
  const discount = isClient ? 0 : number(input.discount ?? 0, 'Discount', { max: subtotal });
  const taxRate = number(isClient ? (plan.taxRate || 0) : (input.taxRate ?? plan.taxRate ?? 0), 'Tax rate', { max: 28 });
  const taxableAmount = round(subtotal - discount);
  const taxAmount = round(taxableAmount * taxRate / 100);
  const total = round(taxableAmount + taxAmount);
  const advancePercent = number(isClient ? (plan.advancePercent ?? 30) : (input.advancePercent ?? plan.advancePercent ?? 30), 'Advance percentage', { max: 100 });
  return {
    version, expectedGuests:guests, actualGuests, attendance, billingBasis:version===1?'legacy':actualGuests===null?'estimate':'actual', duration, venueRates, foodBase, minimumFoodValue, minimumFoodTopUp, eventType:input.type, plan: { ...plan, menus, features: normalizeFeatures(plan.features) }, menu: selectedMenu, venueRate, venueAmount, plateType, plateRate,
    guaranteedPlates, extraPlates, billedPlates, cateringAmount, packageAmount,
    addonLines, addonAmount, subtotal, discount, taxableAmount, taxRate, taxAmount,
    total, advancePercent, advanceAmount: round(total * advancePercent / 100),
  };
}
