// Simulación sencilla de compra/venta para ítem con baseUnit = G y displayUnit = KG
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const TO_BASE = {
  MG: 0.001,
  G: 1,
  KG: 1000,
};
function convertToBase(qty, from, base) {
  if (from === base) return qty;
  // asumimos misma familia WEIGHT
  const inBase = qty * TO_BASE[from];
  const factor = 1 / TO_BASE[base];
  return inBase * factor;
}

function simulatePurchaseThenSale() {
  console.log('--- Compra 1 KG a 1500, luego venta 500 G a 1500 ---');
  // compra
  const purchaseQty = 1; // KG
  const purchaseUom = 'KG';
  const baseUnit = 'G';
  const purchaseQtyBase = convertToBase(purchaseQty, purchaseUom, baseUnit); // 1000 g
  const rawUnitCost = 1500; // precio por KG ingresado
  const factor = convertToBase(1, purchaseUom, baseUnit); // 1000
  const unitCostBase = r2(rawUnitCost / factor); // 1500 / 1000 = 1.5 por g
  console.log('purchaseQtyBase=', purchaseQtyBase, 'unitCostBase=', unitCostBase);
  // stockLayer state
  let layers = [{ remainingQty: purchaseQtyBase, unitCost: unitCostBase }];

  // venta
  const saleQty = 500; // G
  const saleUom = 'G';
  const saleQtyBase = convertToBase(saleQty, saleUom, baseUnit); // 500
  console.log('saleQtyBase=', saleQtyBase);

  // FIFO consumption
  let remaining = saleQtyBase;
  let weightedCostSum = 0;
  let consumed = 0;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const avail = layer.remainingQty;
    const take = Math.min(avail, remaining);
    weightedCostSum += take * layer.unitCost;
    consumed += take;
    layer.remainingQty = layer.remainingQty - take;
    remaining -= take;
  }
  const avgCost = consumed > 0 ? r2(weightedCostSum / consumed) : 0;
  const cogs = r2(consumed * avgCost);
  console.log('consumed=', consumed, 'avgCost=', avgCost, 'COGS=', cogs);
}

function simulateSaleThenPurchase(allowNegative = true) {
  console.log('--- Venta 500 G a 1500, luego compra 1 KG a 1500 (venta antes de compra) ---');
  const baseUnit = 'G';

  // venta primero: no layers, allow negative -> create negative stock with unitCost? We'll simulate negative consumption using future purchase cost as fallback
  const saleQtyBase = 500; // 500 g
  // If no layers, system might allow negative and set avgCost 0 or use some fallback. For our logic we assume negative consumption will record move with unitCost computed at time of consumption from layers (if allowNegative true, code uses remainingQty and allowNegative to include remaining), but to simulate correct unit conversion we check that when purchase arrives avgCost computed correctly.

  // Simulate negative layer created by sale (consumed 500, no cost known) -> system may create stockMove with unitCost 0 or last known cost; we'll just show that when purchase arrives, purchase unitCostBase is 1.5 and then future sells will use 1.5 per g.
  console.log('Sale before purchase: cannot compute COGS without layers -> system may record 0 or postpone. After purchase, new layers will have unitCostBase and future sales will compute correctly.');

  // Now purchase arrives
  const purchaseQtyBase = convertToBase(1, 'KG', 'G'); // 1000
  const rawUnitCost = 1500; // per KG
  const unitCostBase = r2(rawUnitCost / convertToBase(1, 'KG', 'G'));
  console.log('After purchase: purchaseQtyBase=', purchaseQtyBase, 'unitCostBase=', unitCostBase);

  // If we then sell 500g, the COGS will be 500 * 1.5 = 750
  const cogs = r2(500 * unitCostBase);
  console.log('COGS for subsequent 500g sale =', cogs);
}

simulatePurchaseThenSale();
simulateSaleThenPurchase();
