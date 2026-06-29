import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import { jsonVal } from '@/lib/db-json';

// ============================================================
// POST /api/admin/reseed-map-data
// ------------------------------------------------------------
// Idempotent admin migration that REPLACES all sample master data
// across the retail modules with realistic MAP Active / mapclub.com
// e-commerce data.
//
// Modules handled:
//   ARTICLE_MASTER, STORE_MASTER, SUPPLIER_MASTER,
//   PRICING_MASTER, PROMOTION_MASTER, CUSTOMER_MASTER,
//   BRAND_MASTER, INVENTORY_MASTER
//
// What this endpoint does (idempotent — safe to re-run):
//   Step 1. Delete existing DataRecord + related data for target modules
//   Step 2. Create 55 Article + 16 Store + 12 Supplier + 20 Pricing +
//           10 Promotion + 8 Customer + 6 Brand + 15 Inventory records
//   Step 3. Create ImageAsset records for articles
//   Step 4. Create DigitalAsset records for articles
//   Step 5. Create HierarchyNode entries linking articles to hierarchies
//   Step 6. Create BusinessRule entries
//   Step 7. Create StewardshipTask entries
//   Step 8. Create DataQualityScore entries
//   Step 9. Return summary
//
// Auth: Super Admin only
// ============================================================

// ── Module codes we manage ─────────────────────────────────────
const TARGET_MODULE_CODES = [
  'ARTICLE_MASTER',
  'STORE_MASTER',
  'SUPPLIER_MASTER',
  'PRICING_MASTER',
  'PROMOTION_MASTER',
  'CUSTOMER_MASTER',
  'BRAND_MASTER',
  'INVENTORY_MASTER',
] as const;

// ── Status distribution helpers ────────────────────────────────
type RecStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED';

function pickStatus(index: number, total: number): RecStatus {
  const pct = index / total;
  if (pct < 0.40) return 'PUBLISHED';
  if (pct < 0.60) return 'APPROVED';
  if (pct < 0.80) return 'IN_REVIEW';
  if (pct < 0.90) return 'DRAFT';
  if (pct < 0.95) return 'REJECTED';
  return 'ARCHIVED';
}

function pickQualityScore(status: RecStatus): number {
  switch (status) {
    case 'PUBLISHED': return 85 + Math.floor(Math.random() * 15);
    case 'APPROVED': return 75 + Math.floor(Math.random() * 20);
    case 'IN_REVIEW': return 50 + Math.floor(Math.random() * 30);
    case 'DRAFT': return 20 + Math.floor(Math.random() * 40);
    case 'REJECTED': return 10 + Math.floor(Math.random() * 30);
    case 'ARCHIVED': return 40 + Math.floor(Math.random() * 30);
  }
}

function pickCompletenessScore(status: RecStatus): number {
  switch (status) {
    case 'PUBLISHED': return 90 + Math.floor(Math.random() * 10);
    case 'APPROVED': return 80 + Math.floor(Math.random() * 15);
    case 'IN_REVIEW': return 60 + Math.floor(Math.random() * 30);
    case 'DRAFT': return 30 + Math.floor(Math.random() * 40);
    case 'REJECTED': return 40 + Math.floor(Math.random() * 30);
    case 'ARCHIVED': return 50 + Math.floor(Math.random() * 30);
  }
}

// ── Parallel chunked insert helper ─────────────────────────────
async function parallelChunked<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  chunkSize = 8,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((item, j) => fn(item, i + j)),
    );
    results.push(...chunkResults);
  }
  return results;
}

// ── Article seed data (55 records) ─────────────────────────────
const ARTICLE_SEEDS = [
  // FOOTWEAR → Running Shoes (5)
  { code: 'ART-001', name: 'Nike Air Zoom Pegasus 40', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Nike', purchasePrice: 1200000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — lightweight running shoe with responsive ZoomX cushioning for daily training and marathon prep.' },
  { code: 'ART-002', name: 'Adidas Ultraboost Light', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Adidas', purchasePrice: 2200000, sellingPrice: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Adidas Ultraboost Light with the lightest BOOST midsole ever created, energy return for every stride.' },
  { code: 'ART-003', name: 'Asics Gel-Kayano 30', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Asics', purchasePrice: 1800000, sellingPrice: 2799000, tags: 'BEST_SELLER', description: 'Asics Gel-Kayano 30 with 4D Guidance System for stability runners who need premium support.' },
  { code: 'ART-004', name: 'New Balance Fresh Foam X 1080v13', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'New Balance', purchasePrice: 1650000, sellingPrice: 2499000, tags: 'FEATURED', description: 'New Balance 1080v13 with Fresh Foam X midsole — the pinnacle of cushioned running experience.' },
  { code: 'ART-005', name: 'Puma Deviate NITRO 4', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Puma', purchasePrice: 2000000, sellingPrice: 2999000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Puma Deviate NITRO 4 with advanced NITRO foam for elite performance running.' },

  // FOOTWEAR → Basketball Shoes (4)
  { code: 'ART-006', name: 'Nike Air Jordan 1 Retro High OG', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Jordan', purchasePrice: 2500000, sellingPrice: 3899000, tags: 'EXCLUSIVE,PREMIUM', description: 'Air Jordan 1 Retro High OG — the icon that started it all, premium leather construction.' },
  { code: 'ART-007', name: 'Adidas Harden Stepback 3', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Adidas', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'BEST_SELLER', description: 'Adidas Harden Stepback 3 with Light Strike cushioning for quick court moves.' },
  { code: 'ART-008', name: 'Nike LeBron XXI', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Nike', purchasePrice: 2800000, sellingPrice: 4299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Nike LeBron XXI with Zoom Air Strobel and cable containment system for elite performance.' },
  { code: 'ART-009', name: 'Puma MB.02 LaFrancé', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Puma', purchasePrice: 1500000, sellingPrice: 2299000, tags: 'NEW_ARRIVAL', description: 'Puma MB.02 LaFrancé with NITRO Foam for explosive basketball performance.' },

  // FOOTWEAR → Casual Sneakers (5)
  { code: 'ART-010', name: 'Converse Chuck 70 Hi', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Converse', purchasePrice: 850000, sellingPrice: 1399000, tags: 'BEST_SELLER', description: 'Converse Chuck 70 High-top classic with premium canvas and OrthoLite insole.' },
  { code: 'ART-011', name: 'Vans Old Skool', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Vans', purchasePrice: 720000, sellingPrice: 1099000, tags: 'BEST_SELLER', description: 'Vans Old Skool with iconic side stripe, classic skateboard heritage since 1977.' },
  { code: 'ART-012', name: 'Nike Air Force 1 \'07', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Nike', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'BEST_SELLER,FEATURED', description: 'Nike Air Force 1 \'07 white classic, the streetwear icon since 1982.' },
  { code: 'ART-013', name: 'Adidas Samba OG', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Adidas', purchasePrice: 980000, sellingPrice: 1100000, tags: 'EXCLUSIVE', description: 'Adidas Samba OG original edition, premium suede upper with classic gum sole.' },
  { code: 'ART-014', name: 'Fila Disruptor II Premium', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Fila', purchasePrice: 680000, sellingPrice: 999000, tags: 'SALE', description: 'Fila Disruptor II Premium chunky sneaker with thick midsole and leather upper.' },

  // FOOTWEAR → Sandals (3)
  { code: 'ART-015', name: 'Adidas Adilette Slide', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Adidas', purchasePrice: 350000, sellingPrice: 549000, tags: 'BEST_SELLER', description: 'Adidas Adilette slide sandals with contoured footbed and quick-dry bandage upper.' },
  { code: 'ART-016', name: 'Nike Benassi JDI', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Nike', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Nike Benassi Just Do It slide sandals with synthetic strap and Phylon midsole.' },
  { code: 'ART-017', name: 'Skechers On-the-GO 600', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Skechers', purchasePrice: 420000, sellingPrice: 699000, tags: 'NEW_ARRIVAL', description: 'Skechers On-the-GO 600 sandal with Goga Mat pillar technology for all-day comfort.' },

  // FOOTWEAR → Training Shoes (3)
  { code: 'ART-018', name: 'Nike MC Trainer 3', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Nike', purchasePrice: 750000, sellingPrice: 1099000, tags: 'NEW_ARRIVAL', description: 'Nike MC Trainer 3 versatile training shoe for gym workouts and field training.' },
  { code: 'ART-019', name: 'Adidas Dropset Base Trainer', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Adidas', purchasePrice: 680000, sellingPrice: 1000000, tags: 'FEATURED', description: 'Adidas Dropset Base Trainer with BOUNCE cushioning for versatile gym training.' },
  { code: 'ART-020', name: 'Under Armour TriBase Reign 5', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Under Armour', purchasePrice: 1350000, sellingPrice: 1999000, tags: 'PREMIUM', description: 'Under Armour TriBase Reign 5 with Micro G foam and external heel clamp for cross-training stability.' },

  // FOOTWEAR → Boots (2)
  { code: 'ART-021', name: 'Timberland Classic 6-Inch Premium Boot', category: 'FOOTWEAR', subCategory: 'BOOTS', brand: 'Timberland', purchasePrice: 2200000, sellingPrice: 3499000, tags: 'PREMIUM,BEST_SELLER', description: 'Timberland Classic 6-Inch Premium waterproof boot with premium full-grain leather and sealed seams.' },
  { code: 'ART-022', name: 'Columbia Redmond III Waterproof', category: 'FOOTWEAR', subCategory: 'BOOTS', brand: 'Columbia', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'FEATURED', description: 'Columbia Redmond III waterproof hiking boot with Omni-Grip traction and Techlite midsole.' },

  // FOOTWEAR → Formal Shoes (2)
  { code: 'ART-023', name: 'Nike Court Royale 2 Next Nature', category: 'FOOTWEAR', subCategory: 'FORMAL_SHOES', brand: 'Nike', purchasePrice: 520000, sellingPrice: 749000, tags: 'NEW_ARRIVAL', description: 'Nike Court Royale 2 Next Nature with recycled materials and clean tennis-inspired design.' },
  { code: 'ART-024', name: 'Hoka Clifton 9', category: 'FOOTWEAR', subCategory: 'FORMAL_SHOES', brand: 'Hoka', purchasePrice: 2700000, sellingPrice: 4000000, tags: 'PREMIUM,EXCLUSIVE', description: 'Hoka Clifton 9 with signature maximalist cushioning and meta-rocker for smooth transitions.' },

  // APPAREL → T-Shirts (5)
  { code: 'ART-025', name: 'Nike Dri-FIT Miler Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Nike', purchasePrice: 280000, sellingPrice: 449000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT Miler running tee with moisture-wicking fabric and reflective elements.' },
  { code: 'ART-026', name: 'Adidas Own The Run Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Adidas', purchasePrice: 320000, sellingPrice: 499000, tags: 'NEW_ARRIVAL', description: 'Adidas Own The Run tee with AEROREADY technology for moisture management during runs.' },
  { code: 'ART-027', name: 'Under Armour Tech 2.0 Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Under Armour', purchasePrice: 300000, sellingPrice: 479000, tags: 'BEST_SELLER', description: 'Under Armour Tech 2.0 short-sleeve tee with UA Tech fabric for ultra-soft comfort.' },
  { code: 'ART-028', name: 'Puma Active Crew Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Puma', purchasePrice: 250000, sellingPrice: 399000, tags: 'SALE', description: 'Puma Active crew neck tee with dryCELL moisture-wicking technology for everyday training.' },
  { code: 'ART-029', name: 'Lotto Performance Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Lotto', purchasePrice: 180000, sellingPrice: 299000, tags: 'FEATURED', description: 'Lotto Performance tee with lightweight breathable fabric for active lifestyles.' },

  // APPAREL → Hoodies (3)
  { code: 'ART-030', name: 'Nike Sportswear Club Fleece Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'Nike', purchasePrice: 550000, sellingPrice: 849000, tags: 'BEST_SELLER', description: 'Nike Sportswear Club Fleece hoodie with brushed interior for cozy warmth.' },
  { code: 'ART-031', name: 'Adidas Trefoil Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'Adidas', purchasePrice: 620000, sellingPrice: 949000, tags: 'FEATURED', description: 'Adidas Trefoil hoodie with cotton French terry and the iconic Trefoil logo.' },
  { code: 'ART-032', name: 'The North Face Glacier Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'The North Face', purchasePrice: 580000, sellingPrice: 899000, tags: 'NEW_ARRIVAL', description: 'The North Face Glacier hoodie with recycled fleece for lightweight warmth on the trail.' },

  // APPAREL → Jackets (3)
  { code: 'ART-033', name: 'The North Face Venture 2 Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'The North Face', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'PREMIUM,BEST_SELLER', description: 'The North Face Venture 2 waterproof jacket with DryVent 2.5L technology.' },
  { code: 'ART-034', name: 'Columbia Watertight II Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'Columbia', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'FEATURED', description: 'Columbia Watertight II jacket with Omni-Tech waterproof-breathable technology.' },
  { code: 'ART-035', name: 'Adidas Terrex Wind Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'Adidas', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL', description: 'Adidas Terrex wind jacket with WIND.RDY technology for lightweight protection on the trail.' },

  // APPAREL → Pants (3)
  { code: 'ART-036', name: 'Nike Sportswear Club Joggers', category: 'APPAREL', subCategory: 'PANTS', brand: 'Nike', purchasePrice: 480000, sellingPrice: 749000, tags: 'BEST_SELLER', description: 'Nike Sportswear Club fleece joggers with tapered fit and elastic cuffs.' },
  { code: 'ART-037', name: 'Under Armour Launch Tapered Pants', category: 'APPAREL', subCategory: 'PANTS', brand: 'Under Armour', purchasePrice: 520000, sellingPrice: 799000, tags: 'FEATURED', description: 'Under Armour Launch tapered pants with UA Storm technology for water-resistant performance.' },
  { code: 'ART-038', name: 'Puma Essentials Track Pants', category: 'APPAREL', subCategory: 'PANTS', brand: 'Puma', purchasePrice: 380000, sellingPrice: 599000, tags: 'SALE', description: 'Puma Essentials track pants with dryCELL technology and relaxed fit.' },

  // APPAREL → Shorts (2)
  { code: 'ART-039', name: 'Nike Flex Stride Running Shorts', category: 'APPAREL', subCategory: 'SHORTS', brand: 'Nike', purchasePrice: 320000, sellingPrice: 499000, tags: 'BEST_SELLER', description: 'Nike Flex Stride running shorts with built-in briefs and Dri-FIT technology.' },
  { code: 'ART-040', name: 'Adidas Run It Short', category: 'APPAREL', subCategory: 'SHORTS', brand: 'Adidas', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Adidas Run It shorts with AEROREADY technology and reflective details.' },

  // ACCESSORIES → Bags (3)
  { code: 'ART-041', name: 'Nike Aura Crescent Crossbody Bag', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'Nike', purchasePrice: 380000, sellingPrice: 569000, tags: 'NEW_ARRIVAL', description: 'Nike Aura Crescent crossbody bag with lightweight construction and adjustable strap.' },
  { code: 'ART-042', name: 'Adidas Tiro League Backpack', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'Adidas', purchasePrice: 520000, sellingPrice: 799000, tags: 'FEATURED', description: 'Adidas Tiro League backpack with laptop compartment and Primegreen recycled materials.' },
  { code: 'ART-043', name: 'The North Face Borealis Backpack', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'The North Face', purchasePrice: 850000, sellingPrice: 1299000, tags: 'PREMIUM,BEST_SELLER', description: 'The North Face Borealis 28L backpack with FlexVent suspension system.' },

  // ACCESSORIES → Hats (2)
  { code: 'ART-044', name: 'Nike Dri-FIT AeroBill Cap', category: 'ACCESSORIES', subCategory: 'HATS', brand: 'Nike', purchasePrice: 220000, sellingPrice: 349000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT AeroBill cap with moisture-wicking sweatband and adjustable closure.' },
  { code: 'ART-045', name: 'New Balance Essence Trucker Cap', category: 'ACCESSORIES', subCategory: 'HATS', brand: 'New Balance', purchasePrice: 180000, sellingPrice: 299000, tags: 'FEATURED', description: 'New Balance trucker cap with mesh back panels and embroidered NB logo.' },

  // ACCESSORIES → Socks (2)
  { code: 'ART-046', name: 'Nike Everyday Plus Cushion Socks 3-Pack', category: 'ACCESSORIES', subCategory: 'SOCKS', brand: 'Nike', purchasePrice: 120000, sellingPrice: 199000, tags: 'BEST_SELLER', description: 'Nike Everyday Plus cushioned training socks in a 3-pack with Dri-FIT technology.' },
  { code: 'ART-047', name: 'Adidas Traxion Running Socks', category: 'ACCESSORIES', subCategory: 'SOCKS', brand: 'Adidas', purchasePrice: 95000, sellingPrice: 159000, tags: 'SALE', description: 'Adidas Traxion running socks with arch compression and moisture-wicking yarn.' },

  // ACCESSORIES → Watches (2)
  { code: 'ART-048', name: 'Casio G-Shock GA-2100 "Casioak"', category: 'ACCESSORIES', subCategory: 'WATCHES', brand: 'Casio', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Casio G-Shock GA-2100 with carbon core guard structure and minimalist octagonal bezel.' },
  { code: 'ART-049', name: 'Timberland TBL.5144 Field Watch', category: 'ACCESSORIES', subCategory: 'WATCHES', brand: 'Timberland', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'FEATURED', description: 'Timberland TBL.5144 field watch with stainless steel case and genuine leather strap.' },

  // ACCESSORIES → Sunglasses (1)
  { code: 'ART-050', name: 'Nike Vision Wings Shield', category: 'ACCESSORIES', subCategory: 'SUNGLASSES', brand: 'Nike', purchasePrice: 780000, sellingPrice: 1199000, tags: 'NEW_ARRIVAL', description: 'Nike Vision Wings shield sunglasses with Nike Optics for distortion-free vision.' },

  // ACCESSORIES → Belts (1)
  { code: 'ART-051', name: 'Columbia Leather Hiking Belt', category: 'ACCESSORIES', subCategory: 'BELTS', brand: 'Columbia', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Columbia genuine leather hiking belt with durable metal buckle.' },

  // SPORTS_EQUIPMENT → Football (2)
  { code: 'ART-052', name: 'Nike Phantom 6 Low Acad FG/MG', category: 'SPORTS_EQUIPMENT', subCategory: 'FOOTBALL', brand: 'Nike', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Nike Phantom 6 Low Academy football boot with NikeSkin upper for precision touch.' },
  { code: 'ART-053', name: 'Diadora Pichichi 8 MG14', category: 'SPORTS_EQUIPMENT', subCategory: 'FOOTBALL', brand: 'Diadora', purchasePrice: 850000, sellingPrice: 1299000, tags: 'FEATURED', description: 'Diadora Pichichi 8 MG14 football boot with premium leather and multi-ground outsole.' },

  // SPORTS_EQUIPMENT → Basketball (1)
  { code: 'ART-054', name: 'Spalding NBA Official Game Ball', category: 'SPORTS_EQUIPMENT', subCategory: 'BASKETBALL', brand: 'Spalding', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'PREMIUM,EXCLUSIVE', description: 'Spalding NBA official game basketball with full-grain Horween leather construction.' },

  // SPORTS_EQUIPMENT → Gym Equipment (1)
  { code: 'ART-055', name: 'Adidas Adjustable Dumbbell Set 24kg', category: 'SPORTS_EQUIPMENT', subCategory: 'GYM_EQUIPMENT', brand: 'Adidas', purchasePrice: 2800000, sellingPrice: 4299000, tags: 'PREMIUM,FEATURED', description: 'Adidas adjustable dumbbell set 24kg with quick-change weight mechanism.' },
];

// ── Store seed data (16 records) ───────────────────────────────
const STORE_SEEDS = [
  { code: 'STR-001', name: 'Planet Sports Grand Indonesia', mallName: 'Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Grand Indonesia Mall Lt. 1, Jl. MH Thamrin No. 1', phone: '+622123587001', storeType: 'FLAGSHIP', operatingHours: '10:00-22:00', areaSqm: 450 },
  { code: 'STR-002', name: 'Sports Station Pondok Indah Mall', mallName: 'Pondok Indah Mall', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Pondok Indah Mall 2 Lt. 2, Jl. Metro Pondok Indah', phone: '+622127895002', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 320 },
  { code: 'STR-003', name: 'Nike Plaza Indonesia', mallName: 'Plaza Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Plaza Indonesia Lt. 3, Jl. MH Thamrin No. 28-30', phone: '+622139837003', storeType: 'SPECIALTY', operatingHours: '10:00-22:00', areaSqm: 280 },
  { code: 'STR-004', name: 'Adidas Pacific Place', mallName: 'Pacific Place', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Pacific Place Mall Lt. 1, Jl. Sudirman Kav. 52-53', phone: '+622125277004', storeType: 'SPECIALTY', operatingHours: '10:00-22:00', areaSqm: 260 },
  { code: 'STR-005', name: 'Zara Mall of Indonesia', mallName: 'Mall of Indonesia', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Mall of Indonesia Lt. 1, Jl. Boulevard Raya Kelapa Gading', phone: '+622145865005', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 380 },
  { code: 'STR-006', name: 'Mango Central Park Mall', mallName: 'Central Park Mall', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Central Park Mall Lt. 2, Jl. Letjen S. Parman Kav. 28', phone: '+622129607006', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 300 },
  { code: 'STR-007', name: 'Starbucks Plaza Senayan', mallName: 'Plaza Senayan', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Plaza Senayan Lt. 1, Jl. Asia Afrika No. 8', phone: '+622157254007', storeType: 'SPECIALTY', operatingHours: '07:00-23:00', areaSqm: 120 },
  { code: 'STR-008', name: 'Marks & Spencer Senayan City', mallName: 'Senayan City', region: 'JABODETABEK', city: 'Jakarta', province: 'DKI Jakarta', address: 'Senayan City Lt. 2, Jl. Asia Afrika No. 8', phone: '+622172668008', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 350 },
  { code: 'STR-009', name: 'Nike Trans Studio Mall Bandung', mallName: 'Trans Studio Mall', region: 'WEST_JAVA', city: 'Bandung', province: 'Jawa Barat', address: 'Trans Studio Mall Lt. 2, Jl. Jend. Gatot Subroto No. 289', phone: '+622292503009', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 280 },
  { code: 'STR-010', name: 'Adidas Ciputra World Surabaya', mallName: 'Ciputra World', region: 'EAST_JAVA', city: 'Surabaya', province: 'Jawa Timur', address: 'Ciputra World Lt. 2, Jl. Mayjen Sungkono', phone: '+62317346010', storeType: 'FLAGSHIP', operatingHours: '10:00-22:00', areaSqm: 400 },
  { code: 'STR-011', name: 'Planet Sports Paragon Mall Semarang', mallName: 'Paragon Mall', region: 'CENTRAL_JAVA', city: 'Semarang', province: 'Jawa Tengah', address: 'Paragon Mall Lt. 2, Jl. Pemuda No. 119', phone: '+622426738011', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 300 },
  { code: 'STR-012', name: 'Sports Station Sun Plaza Medan', mallName: 'Sun Plaza', region: 'SUMATRA', city: 'Medan', province: 'Sumatera Utara', address: 'Sun Plaza Lt. 3, Jl. Zainul Arifin No. 1', phone: '+6261458012', storeType: 'STANDARD', operatingHours: '10:00-22:00', areaSqm: 320 },
  { code: 'STR-013', name: 'Nike Living World Alam Sutera', mallName: 'Living World', region: 'WEST_JAVA', city: 'Tangerang', province: 'Banten', address: 'Living World Lt. 2, Jl. Alam Sutera Boulevard Kav. 21', phone: '+62215377013', storeType: 'FLAGSHIP', operatingHours: '10:00-22:00', areaSqm: 420 },
  { code: 'STR-014', name: 'Converse Bali Collection', mallName: 'Bali Collection', region: 'BALI_NT', city: 'Kuta', province: 'Bali', address: 'Bali Collection Mall Lt. 1, Jl. Bypass Ngurah Rai', phone: '+62361767014', storeType: 'OUTLET', operatingHours: '10:00-22:00', areaSqm: 200 },
  { code: 'STR-015', name: 'Puma Transmart Makassar', mallName: 'Trans Studio Mall Makassar', region: 'SULAWESI', city: 'Makassar', province: 'Sulawesi Selatan', address: 'Trans Studio Mall Lt. 2, Jl. H. Andi Mappanyukki', phone: '+62411845015', storeType: 'OUTLET', operatingHours: '10:00-22:00', areaSqm: 220 },
  { code: 'STR-016', name: 'Hoka Plaza Medan Fair', mallName: 'Plaza Medan Fair', region: 'SUMATRA', city: 'Medan', province: 'Sumatera Utara', address: 'Plaza Medan Fair Lt. 1, Jl. Jend. Gatot Subroto', phone: '+62614534016', storeType: 'SPECIALTY', operatingHours: '10:00-22:00', areaSqm: 180 },
];

// ── Supplier seed data (12 records) ────────────────────────────
const SUPPLIER_SEEDS = [
  { code: 'SUP-001', name: 'Nike Inc. Indonesia', type: 'MANUFACTURER', contact: 'Budi Santoso', email: 'budi.santoso@nike.co.id', phone: '+62215501001', address: 'Menara Sahid Lt. 15, Jl. Jend. Sudirman No. 86, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-001.000', paymentTerms: 'NET_60' },
  { code: 'SUP-002', name: 'Adidas AG Indonesia', type: 'MANUFACTURER', contact: 'Siti Rahayu', email: 'siti.rahayu@adidas.co.id', phone: '+62215501002', address: 'Menara Palma Lt. 10, Jl. HR Rasuna Said Blk X-2 Kav. 6, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-002.000', paymentTerms: 'NET_60' },
  { code: 'SUP-003', name: 'Puma SE Indonesia', type: 'MANUFACTURER', contact: 'Arief Wicaksono', email: 'arief.w@puma.co.id', phone: '+62215501003', address: 'Satrio Tower Lt. 18, Jl. Prof. DR. Satrio Kav. C4, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-003.000', paymentTerms: 'NET_30' },
  { code: 'SUP-004', name: 'Converse Indonesia Distributor', type: 'DISTRIBUTOR', contact: 'Dewi Kusuma', email: 'dewi.k@converse-dist.co.id', phone: '+62215501004', address: 'Jl. Karet Pedurenan No. 22, Jakarta Selatan', city: 'Jakarta', taxId: '01.234.567.8-004.000', paymentTerms: 'NET_30' },
  { code: 'SUP-005', name: 'New Balance Asia Pacific', type: 'MANUFACTURER', contact: 'James Lim', email: 'james.lim@newbalance.co.id', phone: '+62215501005', address: 'Pacific Century Place Lt. 12, Jl. Jend. Sudirman Kav. 52-53, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-005.000', paymentTerms: 'NET_60' },
  { code: 'SUP-006', name: 'Asics Indonesia', type: 'DISTRIBUTOR', contact: 'Takeshi Yamada', email: 'takeshi.y@asics.co.id', phone: '+62215501006', address: 'Jl. Boulevard Raya Blok R AA No. 12, Kelapa Gading, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-006.000', paymentTerms: 'NET_30' },
  { code: 'SUP-007', name: 'Under Armour Southeast Asia', type: 'DISTRIBUTOR', contact: 'Michael Chen', email: 'michael.c@underarmour.co.id', phone: '+62215501007', address: 'DBS Bank Tower Lt. 20, Jl. Imam Bonjol No. 18, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-007.000', paymentTerms: 'NET_30' },
  { code: 'SUP-008', name: 'Skechers Indonesia', type: 'DISTRIBUTOR', contact: 'Rini Handayani', email: 'rini.h@skechers.co.id', phone: '+62215501008', address: 'Jl. Tanah Abang III No. 23, Jakarta Pusat', city: 'Jakarta', taxId: '01.234.567.8-008.000', paymentTerms: 'COD' },
  { code: 'SUP-009', name: 'VF Corporation (Vans/Timberland)', type: 'MANUFACTURER', contact: 'David Park', email: 'david.p@vfc.co.id', phone: '+62215501009', address: 'Gold Coast Office Tower Lt. 9, Jl. Jend. Sudirman Kav. 19, Jakarta', city: 'Jakarta', taxId: '01.234.567.8-009.000', paymentTerms: 'NET_60' },
  { code: 'SUP-010', name: 'The North Face Indonesia', type: 'DISTRIBUTOR', contact: 'Sarah Wijaya', email: 'sarah.w@tnf.co.id', phone: '+62215501010', address: 'Jl. Senopati No. 61, Jakarta Selatan', city: 'Jakarta', taxId: '01.234.567.8-010.000', paymentTerms: 'NET_30' },
  { code: 'SUP-011', name: 'Columbia Sportswear Asia', type: 'WHOLESALER', contact: 'Tom Anderson', email: 'tom.a@columbia.co.id', phone: '+62215501011', address: 'Jl. Kemang Raya No. 35, Jakarta Selatan', city: 'Jakarta', taxId: '01.234.567.8-011.000', paymentTerms: 'NET_90' },
  { code: 'SUP-012', name: 'Fila & Lotto Local Distributor', type: 'LOCAL', contact: 'Agus Prasetyo', email: 'agus.p@filalotto.co.id', phone: '+62215501012', address: 'Jl. Pasar Baru Selatan No. 15, Jakarta Pusat', city: 'Jakarta', taxId: '01.234.567.8-012.000', paymentTerms: 'CBD' },
];

// ── Customer seed data (8 records) ─────────────────────────────
const CUSTOMER_SEEDS = [
  { code: 'CUS-001', fullName: 'Ratna Sari', email: 'ratna.sari@email.com', phone: '+62812345001', gender: 'FEMALE', membershipTier: 'PLATINUM', points: 12500, city: 'Jakarta', registrationDate: '2022-03-15' },
  { code: 'CUS-002', fullName: 'Ahmad Fauzi', email: 'ahmad.fauzi@email.com', phone: '+62812345002', gender: 'MALE', membershipTier: 'GOLD', points: 8200, city: 'Jakarta', registrationDate: '2022-06-20' },
  { code: 'CUS-003', fullName: 'Lisa Permata', email: 'lisa.permata@email.com', phone: '+62812345003', gender: 'FEMALE', membershipTier: 'GOLD', points: 9100, city: 'Bandung', registrationDate: '2022-08-10' },
  { code: 'CUS-004', fullName: 'Budi Hartono', email: 'budi.hartono@email.com', phone: '+62812345004', gender: 'MALE', membershipTier: 'SILVER', points: 4300, city: 'Surabaya', registrationDate: '2023-01-05' },
  { code: 'CUS-005', fullName: 'Dewi Lestari', email: 'dewi.lestari@email.com', phone: '+62812345005', gender: 'FEMALE', membershipTier: 'SILVER', points: 3800, city: 'Semarang', registrationDate: '2023-02-14' },
  { code: 'CUS-006', fullName: 'Ricky Setiawan', email: 'ricky.setiawan@email.com', phone: '+62812345006', gender: 'MALE', membershipTier: 'REGULAR', points: 1200, city: 'Medan', registrationDate: '2023-05-01' },
  { code: 'CUS-007', fullName: 'Nia Kurniasih', email: 'nia.kurniasih@email.com', phone: '+62812345007', gender: 'FEMALE', membershipTier: 'REGULAR', points: 850, city: 'Bali', registrationDate: '2023-07-22' },
  { code: 'CUS-008', fullName: 'Hendra Wijaya', email: 'hendra.wijaya@email.com', phone: '+62812345008', gender: 'MALE', membershipTier: 'PLATINUM', points: 15800, city: 'Jakarta', registrationDate: '2021-11-30' },
];

// ── Brand seed data (6 records) ────────────────────────────────
const BRAND_SEEDS = [
  { code: 'BRD-001', name: 'Nike', category: 'SPORTSWEAR', countryOfOrigin: 'United States', website: 'https://www.nike.com', description: 'Nike, Inc. — global leader in athletic footwear, apparel, equipment, and accessories.' },
  { code: 'BRD-002', name: 'Adidas', category: 'SPORTSWEAR', countryOfOrigin: 'Germany', website: 'https://www.adidas.com', description: 'Adidas AG — global sportswear brand known for innovation in footwear and apparel.' },
  { code: 'BRD-003', name: 'Puma', category: 'SPORTSWEAR', countryOfOrigin: 'Germany', website: 'https://www.puma.com', description: 'Puma SE — sport-lifestyle brand combining performance and style.' },
  { code: 'BRD-004', name: 'The North Face', category: 'OUTDOOR', countryOfOrigin: 'United States', website: 'https://www.thenorthface.com', description: 'The North Face — premium outdoor equipment and apparel for exploration.' },
  { code: 'BRD-005', name: 'Under Armour', category: 'SPORTSWEAR', countryOfOrigin: 'United States', website: 'https://www.underarmour.com', description: 'Under Armour — performance apparel, footwear, and sport accessories.' },
  { code: 'BRD-006', name: 'New Balance', category: 'SPORTSWEAR', countryOfOrigin: 'United States', website: 'https://www.newbalance.com', description: 'New Balance Athletics — premium running and lifestyle footwear.' },
] as const;

// ── Pricing seed data (20 records) ─────────────────────────────
// Each references a valid article_code from ARTICLE_SEEDS
const PRICING_SEEDS = [
  { code: 'PRC-001', articleCode: 'ART-001', priceType: 'REGULAR', price: 1899000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-002', articleCode: 'ART-001', priceType: 'PROMOTIONAL', price: 1599000, currency: 'IDR', effectiveDate: '2024-06-01', expiryDate: '2024-06-30', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-003', articleCode: 'ART-002', priceType: 'REGULAR', price: 3299000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-004', articleCode: 'ART-002', priceType: 'COST', price: 2200000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-005', articleCode: 'ART-003', priceType: 'REGULAR', price: 2799000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'WEST_JAVA' },
  { code: 'PRC-006', articleCode: 'ART-004', priceType: 'REGULAR', price: 2499000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-007', articleCode: 'ART-005', priceType: 'REGULAR', price: 2999000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-008', articleCode: 'ART-006', priceType: 'REGULAR', price: 3899000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-009', articleCode: 'ART-010', priceType: 'REGULAR', price: 1399000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-010', articleCode: 'ART-010', priceType: 'WHOLESALE', price: 999000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'OUTLET', region: 'SUMATRA' },
  { code: 'PRC-011', articleCode: 'ART-012', priceType: 'REGULAR', price: 1699000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-012', articleCode: 'ART-013', priceType: 'REGULAR', price: 1100000, currency: 'IDR', effectiveDate: '2024-02-01', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-013', articleCode: 'ART-018', priceType: 'REGULAR', price: 1099000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'EAST_JAVA' },
  { code: 'PRC-014', articleCode: 'ART-019', priceType: 'REGULAR', price: 1000000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-015', articleCode: 'ART-025', priceType: 'REGULAR', price: 449000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-016', articleCode: 'ART-025', priceType: 'PROMOTIONAL', price: 349000, currency: 'IDR', effectiveDate: '2024-07-01', expiryDate: '2024-07-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
  { code: 'PRC-017', articleCode: 'ART-033', priceType: 'REGULAR', price: 2199000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'BALI_NT' },
  { code: 'PRC-018', articleCode: 'ART-043', priceType: 'REGULAR', price: 1299000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'STANDARD', region: 'JABODETABEK' },
  { code: 'PRC-019', articleCode: 'ART-048', priceType: 'REGULAR', price: 2199000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-020', articleCode: 'ART-055', priceType: 'COST', price: 2800000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'FLAGSHIP', region: 'JABODETABEK' },
];

// ── Promotion seed data (10 records) ───────────────────────────
const PROMOTION_SEEDS = [
  { code: 'PRM-001', name: 'Run Jakarta 2024 — Running Shoes Sale', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-06-01', endDate: '2024-06-30', applicableCategories: 'FOOTWEAR', minPurchase: 500000, maxDiscount: 500000, storeType: 'FLAGSHIP', status: 'PUBLISHED' },
  { code: 'PRM-002', name: 'Adidas BOGO Sneaker Fest', promoType: 'BOGO', discountType: 'BUY_X_GET_Y', discountValue: 50, startDate: '2024-07-01', endDate: '2024-07-15', applicableCategories: 'FOOTWEAR', minPurchase: 1000000, maxDiscount: 1000000, storeType: 'STANDARD', status: 'APPROVED' },
  { code: 'PRM-003', name: 'Summer Apparel Bundle Deal', promoType: 'BUNDLE', discountType: 'FIXED_AMOUNT', discountValue: 200000, startDate: '2024-06-15', endDate: '2024-08-15', applicableCategories: 'APPAREL', minPurchase: 800000, maxDiscount: 200000, storeType: 'FLAGSHIP', status: 'PUBLISHED' },
  { code: 'PRM-004', name: 'Flash Sale — Accessories Up to 40% Off', promoType: 'FLASH_SALE', discountType: 'PERCENTAGE', discountValue: 40, startDate: '2024-07-20', endDate: '2024-07-21', applicableCategories: 'ACCESSORIES', minPurchase: 0, maxDiscount: 800000, storeType: 'STANDARD', status: 'APPROVED' },
  { code: 'PRM-005', name: 'Loyalty Members Double Points Weekend', promoType: 'LOYALTY', discountType: 'PERCENTAGE', discountValue: 10, startDate: '2024-08-01', endDate: '2024-08-04', applicableCategories: 'FOOTWEAR,APPAREL,ACCESSORIES', minPurchase: 300000, maxDiscount: 300000, storeType: 'FLAGSHIP', status: 'IN_REVIEW' },
  { code: 'PRM-006', name: 'Back to Sport — Equipment Discount', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 20, startDate: '2024-09-01', endDate: '2024-09-30', applicableCategories: 'SPORTS_EQUIPMENT', minPurchase: 1000000, maxDiscount: 750000, storeType: 'STANDARD', status: 'DRAFT' },
  { code: 'PRM-007', name: 'Nike Exclusive — Air Max Day', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 25, startDate: '2024-03-26', endDate: '2024-03-31', applicableCategories: 'FOOTWEAR', minPurchase: 1500000, maxDiscount: 750000, storeType: 'SPECIALTY', status: 'PUBLISHED' },
  { code: 'PRM-008', name: 'Outdoor Adventure Sale', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 30, startDate: '2024-10-01', endDate: '2024-10-31', applicableCategories: 'OUTDOOR,SPORTS_EQUIPMENT', minPurchase: 2000000, maxDiscount: 1000000, storeType: 'FLAGSHIP', status: 'DRAFT' },
  { code: 'PRM-009', name: 'Holiday Season BOGO Apparel', promoType: 'BOGO', discountType: 'BUY_X_GET_Y', discountValue: 50, startDate: '2024-12-15', endDate: '2024-12-31', applicableCategories: 'APPAREL', minPurchase: 600000, maxDiscount: 800000, storeType: 'STANDARD', status: 'IN_REVIEW' },
  { code: 'PRM-010', name: 'New Member Welcome 10% Off', promoType: 'LOYALTY', discountType: 'PERCENTAGE', discountValue: 10, startDate: '2024-01-01', endDate: '2024-12-31', applicableCategories: 'FOOTWEAR,APPAREL,ACCESSORIES,SPORTS_EQUIPMENT,OUTDOOR', minPurchase: 200000, maxDiscount: 200000, storeType: 'FLAGSHIP', status: 'PUBLISHED' },
];

// ── Inventory seed data (15 records) ───────────────────────────
// Each references a valid article_code and store_code
const INVENTORY_SEEDS = [
  { code: 'INV-001', articleCode: 'ART-001', storeCode: 'STR-001', quantityOnHand: 45, quantityReserved: 5, reorderPoint: 10, lastRestockDate: '2024-05-15', binLocation: 'FW-RS-01' },
  { code: 'INV-002', articleCode: 'ART-002', storeCode: 'STR-001', quantityOnHand: 22, quantityReserved: 3, reorderPoint: 8, lastRestockDate: '2024-05-20', binLocation: 'FW-RS-02' },
  { code: 'INV-003', articleCode: 'ART-001', storeCode: 'STR-002', quantityOnHand: 30, quantityReserved: 2, reorderPoint: 10, lastRestockDate: '2024-05-10', binLocation: 'FW-RS-01' },
  { code: 'INV-004', articleCode: 'ART-010', storeCode: 'STR-003', quantityOnHand: 55, quantityReserved: 8, reorderPoint: 15, lastRestockDate: '2024-04-28', binLocation: 'FW-CS-01' },
  { code: 'INV-005', articleCode: 'ART-012', storeCode: 'STR-004', quantityOnHand: 38, quantityReserved: 4, reorderPoint: 12, lastRestockDate: '2024-05-05', binLocation: 'FW-CS-02' },
  { code: 'INV-006', articleCode: 'ART-025', storeCode: 'STR-001', quantityOnHand: 120, quantityReserved: 15, reorderPoint: 30, lastRestockDate: '2024-05-22', binLocation: 'AP-TS-01' },
  { code: 'INV-007', articleCode: 'ART-026', storeCode: 'STR-005', quantityOnHand: 85, quantityReserved: 10, reorderPoint: 25, lastRestockDate: '2024-05-18', binLocation: 'AP-TS-02' },
  { code: 'INV-008', articleCode: 'ART-033', storeCode: 'STR-009', quantityOnHand: 12, quantityReserved: 2, reorderPoint: 5, lastRestockDate: '2024-04-15', binLocation: 'AP-JK-01' },
  { code: 'INV-009', articleCode: 'ART-041', storeCode: 'STR-001', quantityOnHand: 60, quantityReserved: 8, reorderPoint: 15, lastRestockDate: '2024-05-25', binLocation: 'AC-BG-01' },
  { code: 'INV-010', articleCode: 'ART-043', storeCode: 'STR-010', quantityOnHand: 18, quantityReserved: 2, reorderPoint: 6, lastRestockDate: '2024-05-12', binLocation: 'AC-BG-02' },
  { code: 'INV-011', articleCode: 'ART-052', storeCode: 'STR-002', quantityOnHand: 8, quantityReserved: 1, reorderPoint: 3, lastRestockDate: '2024-04-20', binLocation: 'SE-FB-01' },
  { code: 'INV-012', articleCode: 'ART-054', storeCode: 'STR-006', quantityOnHand: 5, quantityReserved: 0, reorderPoint: 3, lastRestockDate: '2024-03-30', binLocation: 'SE-BB-01' },
  { code: 'INV-013', articleCode: 'ART-021', storeCode: 'STR-013', quantityOnHand: 14, quantityReserved: 2, reorderPoint: 5, lastRestockDate: '2024-05-08', binLocation: 'FW-BT-01' },
  { code: 'INV-014', articleCode: 'ART-048', storeCode: 'STR-003', quantityOnHand: 7, quantityReserved: 1, reorderPoint: 3, lastRestockDate: '2024-04-25', binLocation: 'AC-WT-01' },
  { code: 'INV-015', articleCode: 'ART-030', storeCode: 'STR-014', quantityOnHand: 25, quantityReserved: 3, reorderPoint: 8, lastRestockDate: '2024-05-01', binLocation: 'AP-HD-01' },
] as const;

// ── Company assignment map (article code prefix → company code) ─
const ARTICLE_COMPANY_MAP: Record<string, string> = {
  'ART-001': 'MAPI', 'ART-002': 'MAPA', 'ART-003': 'MAPA', 'ART-004': 'MAPA',
  'ART-005': 'MAPA', 'ART-006': 'MAPA', 'ART-007': 'MAPA', 'ART-008': 'MAPA',
  'ART-009': 'MAPA', 'ART-010': 'MAPA', 'ART-011': 'MAPA', 'ART-012': 'MAPI',
  'ART-013': 'MAPA', 'ART-014': 'MAPA', 'ART-015': 'MAPA', 'ART-016': 'MAPA',
  'ART-017': 'MAPA', 'ART-018': 'MAPA', 'ART-019': 'MAPA', 'ART-020': 'MAPA',
  'ART-021': 'MAPI', 'ART-022': 'MAPA', 'ART-023': 'MAPI', 'ART-024': 'MAPA',
  'ART-025': 'MAPI', 'ART-026': 'MAPA', 'ART-027': 'MAPA', 'ART-028': 'MAPA',
  'ART-029': 'MAPA', 'ART-030': 'MAPI', 'ART-031': 'MAPA', 'ART-032': 'MAPA',
  'ART-033': 'MAPA', 'ART-034': 'MAPI', 'ART-035': 'MAPA', 'ART-036': 'MAPA',
  'ART-037': 'MAPI', 'ART-038': 'MAPA', 'ART-039': 'MAPA', 'ART-040': 'MAPA',
  'ART-041': 'MAPI', 'ART-042': 'MAPA', 'ART-043': 'MAPA', 'ART-044': 'MAPI',
  'ART-045': 'MAPA', 'ART-046': 'MAPI', 'ART-047': 'MAPA', 'ART-048': 'MAPI',
  'ART-049': 'MAPI', 'ART-050': 'MAPI', 'ART-051': 'MAPA', 'ART-052': 'MAPA',
  'ART-053': 'MAPA', 'ART-054': 'MAPA', 'ART-055': 'MAPA',
};
// Default for articles not in the map
const DEFAULT_ARTICLE_COMPANY = 'MAPI';

const STORE_COMPANY_MAP: Record<string, string> = {
  'STR-001': 'MAPA', 'STR-002': 'MAPA', 'STR-003': 'MAPA', 'STR-004': 'MAPA',
  'STR-005': 'MAPI', 'STR-006': 'MAPI', 'STR-007': 'MBA', 'STR-008': 'MAPI',
  'STR-009': 'MAPA', 'STR-010': 'MAPA', 'STR-011': 'MAPA', 'STR-012': 'MAPA',
  'STR-013': 'MAPA', 'STR-014': 'MAPI', 'STR-015': 'MAPI', 'STR-016': 'MAPA',
};

const PRICING_COMPANY_MAP: Record<string, string> = {
  'PRC-001': 'MAPD', 'PRC-002': 'MAPD', 'PRC-003': 'MAPD', 'PRC-004': 'MAPD',
  'PRC-005': 'MAPD', 'PRC-006': 'MAPD', 'PRC-007': 'MAPD', 'PRC-008': 'MAPD',
  'PRC-009': 'MAPD', 'PRC-010': 'MAPD', 'PRC-011': 'MAPD', 'PRC-012': 'MAPD',
  'PRC-013': 'MAPD', 'PRC-014': 'MAPD', 'PRC-015': 'MAPD', 'PRC-016': 'MAPD',
  'PRC-017': 'MAPD', 'PRC-018': 'MAPD', 'PRC-019': 'MAPD', 'PRC-020': 'MAPD',
};

const PROMOTION_COMPANY_MAP: Record<string, string> = {
  'PRM-001': 'MAPD', 'PRM-002': 'MAPD', 'PRM-003': 'MAPD', 'PRM-004': 'MAPD',
  'PRM-005': 'MAPD', 'PRM-006': 'MAPD', 'PRM-007': 'MAPD', 'PRM-008': 'MAPD',
  'PRM-009': 'MAPD', 'PRM-010': 'MAPD',
};

// ── Image CDN URL helper ───────────────────────────────────────
function mapclubImageUrl(articleCode: string, index: number): string {
  const slug = articleCode.toLowerCase().replace('.', '-');
  return `https://res.mapclub.com/resources/images/products/${slug}-${index}.webp`;
}

// ────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── Authorization ────────────────────────────────────────────
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 });
    }

    console.info(`[reseed-map-data] Authorized reseed requested by Super Admin "${tokenPayload.username}".`);

    // ── Resolve runtime IDs ──────────────────────────────────────
    const modules = await db.metaModule.findMany();
    const moduleByCode: Record<string, { id: string; moduleCode: string }> = {};
    for (const m of modules) moduleByCode[m.moduleCode] = m;

    // Validate all required modules exist
    for (const code of TARGET_MODULE_CODES) {
      if (!moduleByCode[code]) {
        return NextResponse.json(
          { error: `Module ${code} not found. Run /api/seed first.` },
          { status: 400 },
        );
      }
    }

    const companies = await db.tenantCompany.findMany();
    const companyByCode: Record<string, { id: string; companyCode: string }> = {};
    for (const c of companies) companyByCode[c.companyCode] = c;

    // Validate all required companies exist
    for (const code of ['MAPI', 'MAPA', 'MBA', 'MAPD', 'MAPP', 'MAPL']) {
      if (!companyByCode[code]) {
        return NextResponse.json(
          { error: `Company ${code} not found. Run /api/seed first.` },
          { status: 400 },
        );
      }
    }

    // Get a super admin user for createdById
    const superAdminRole = await db.sysRole.findFirst({
      where: { roleName: 'Super Admin' },
    });
    // Find super admin user — try by role first, then by username
    const superAdminUserRole = superAdminRole
      ? await db.userRole.findFirst({ where: { roleId: superAdminRole.id } })
      : null;
    let superAdmin = superAdminUserRole
      ? await db.sysUser.findUnique({ where: { id: superAdminUserRole.userId } })
      : null;
    if (!superAdmin) {
      superAdmin = await db.sysUser.findFirst({ where: { username: 'superadmin' } });
    }
    const adminId: string | null = superAdmin?.id ?? null;

    // Build module ID map for easy access
    const moduleMap: Record<string, string> = {};
    for (const code of TARGET_MODULE_CODES) {
      moduleMap[code] = moduleByCode[code].id;
    }

    // Summary tracking
    const summary: {
      deleted: Record<string, number>;
      created: Record<string, number>;
      steps: string[];
    } = { deleted: {}, created: {}, steps: [] };

    // ============================================================
    // STEP 1: DELETE EXISTING DATA FOR TARGET MODULES
    // ============================================================
    console.info('[reseed-map-data] Step 1: Deleting existing data...');
    const targetModuleIds = TARGET_MODULE_CODES.map((c) => moduleMap[c]);

    // 1a. Find all existing DataRecord IDs for target modules
    const existingRecords = await db.dataRecord.findMany({
      where: { moduleId: { in: targetModuleIds } },
      select: { id: true },
    });
    const existingRecordIds = existingRecords.map((r) => r.id);

    if (existingRecordIds.length > 0) {
      // 1b. Delete related data in dependency order
      const delDataQuality = await db.dataQualityScore.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['DataQualityScore'] = delDataQuality.count;

      const delStewardship = await db.stewardshipTask.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['StewardshipTask'] = delStewardship.count;

      const delImageAssets = await db.imageAsset.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['ImageAsset'] = delImageAssets.count;

      const delDigitalAssets = await db.digitalAsset.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['DigitalAsset'] = delDigitalAssets.count;

      const delDataVersions = await db.dataVersion.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['DataVersion'] = delDataVersions.count;

      const delApprovalTickets = await db.approvalTicket.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['ApprovalTicket'] = delApprovalTickets.count;

      // Delete hierarchy nodes linked to these records
      const delHierarchyNodes = await db.hierarchyNode.deleteMany({
        where: { recordId: { in: existingRecordIds } },
      });
      summary.deleted['HierarchyNode (records)'] = delHierarchyNodes.count;

      // Finally delete the records themselves
      const delDataRecords = await db.dataRecord.deleteMany({
        where: { id: { in: existingRecordIds } },
      });
      summary.deleted['DataRecord'] = delDataRecords.count;
    }

    // 1c. Delete BusinessRules for target modules
    const delBusinessRules = await db.businessRule.deleteMany({
      where: { moduleId: { in: targetModuleIds } },
    });
    summary.deleted['BusinessRule'] = delBusinessRules.count;

    // 1d. Delete orphan hierarchy models created by previous reseed runs
    // Only delete hierarchies on ARTICLE_MASTER (not CATEGORY_MASTER which has the main seed hierarchy)
    const reseedModuleIds = [moduleMap['ARTICLE_MASTER'], moduleMap['STORE_MASTER'], moduleMap['INVENTORY_MASTER']].filter(Boolean);
    const orphanHierarchies = await db.hierarchyModel.findMany({
      where: { moduleId: { in: reseedModuleIds } },
      select: { id: true },
    });
    if (orphanHierarchies.length > 0) {
      const orphanIds = orphanHierarchies.map((h) => h.id);
      // HierarchyNodes are cascade-deleted with their HierarchyModel
      const delOrphanNodes = await db.hierarchyNode.deleteMany({
        where: { hierarchyId: { in: orphanIds } },
      });
      summary.deleted['HierarchyNode (orphan)'] = delOrphanNodes.count;
      const delOrphanModels = await db.hierarchyModel.deleteMany({
        where: { id: { in: orphanIds } },
      });
      summary.deleted['HierarchyModel (orphan)'] = delOrphanModels.count;
    }

    summary.steps.push(
      `Step 1: Deleted existing data — ${JSON.stringify(summary.deleted)}`,
    );
    console.info(`[reseed-map-data] Step 1 complete: deleted ${existingRecordIds.length} records + related data`);

    // ============================================================
    // STEP 2: CREATE ARTICLE MASTER RECORDS (55)
    // ============================================================
    console.info('[reseed-map-data] Step 2: Creating Article records...');
    const articleRecordByCode: Record<string, { id: string; status: string; category: string }> = {};

    await parallelChunked(ARTICLE_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, ARTICLE_SEEDS.length);
      const companyCode = ARTICLE_COMPANY_MAP[seed.code] ?? DEFAULT_ARTICLE_COMPANY;
      const payload = {
        article_code: seed.code,
        article_name: seed.name,
        category: seed.category,
        sub_category: seed.subCategory,
        brand: seed.brand,
        uom: 'PCS',
        purchase_price: seed.purchasePrice,
        selling_price: seed.sellingPrice,
        tags: seed.tags,
        description: seed.description,
        is_active: true,
        images: [
          mapclubImageUrl(seed.code, 1),
          mapclubImageUrl(seed.code, 2),
        ],
      };
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['ARTICLE_MASTER'],
          companyId: companyByCode[companyCode].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
      articleRecordByCode[seed.code] = { id: record.id, status, category: seed.category };
    });
    summary.created['Article'] = ARTICLE_SEEDS.length;
    summary.steps.push(`Step 2: Created ${ARTICLE_SEEDS.length} Article Master records`);
    console.info(`[reseed-map-data] Step 2 complete: ${ARTICLE_SEEDS.length} articles`);

    // ============================================================
    // STEP 3: CREATE STORE MASTER RECORDS (16)
    // ============================================================
    console.info('[reseed-map-data] Step 3: Creating Store records...');
    const storeRecordByCode: Record<string, { id: string; region: string }> = {};

    await parallelChunked(STORE_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, STORE_SEEDS.length);
      const companyCode = STORE_COMPANY_MAP[seed.code] ?? 'MAPI';
      const payload = {
        store_code: seed.code,
        store_name: seed.name,
        mall_name: seed.mallName,
        region: seed.region,
        city: seed.city,
        province: seed.province,
        address: seed.address,
        phone: seed.phone,
        store_type: seed.storeType,
        operating_hours: seed.operatingHours,
        area_sqm: seed.areaSqm,
        is_active: true,
      };
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['STORE_MASTER'],
          companyId: companyByCode[companyCode].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
      storeRecordByCode[seed.code] = { id: record.id, region: seed.region };
    });
    summary.created['Store'] = STORE_SEEDS.length;
    summary.steps.push(`Step 3: Created ${STORE_SEEDS.length} Store Master records`);
    console.info(`[reseed-map-data] Step 3 complete: ${STORE_SEEDS.length} stores`);

    // ============================================================
    // STEP 4: CREATE SUPPLIER MASTER RECORDS (12)
    // ============================================================
    console.info('[reseed-map-data] Step 4: Creating Supplier records...');
    const supplierRecordByCode: Record<string, { id: string }> = {};

    await parallelChunked(SUPPLIER_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, SUPPLIER_SEEDS.length);
      const payload = {
        supplier_code: seed.code,
        supplier_name: seed.name,
        supplier_type: seed.type,
        contact_person: seed.contact,
        email: seed.email,
        phone: seed.phone,
        address: seed.address,
        city: seed.city,
        tax_id: seed.taxId,
        is_active: true,
        payment_terms: seed.paymentTerms,
      };
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['SUPPLIER_MASTER'],
          companyId: companyByCode['MAPI'].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
      supplierRecordByCode[seed.code] = { id: record.id };
    });
    summary.created['Supplier'] = SUPPLIER_SEEDS.length;
    summary.steps.push(`Step 4: Created ${SUPPLIER_SEEDS.length} Supplier Master records`);
    console.info(`[reseed-map-data] Step 4 complete: ${SUPPLIER_SEEDS.length} suppliers`);

    // ============================================================
    // STEP 5: CREATE CUSTOMER MASTER RECORDS (8)
    // ============================================================
    console.info('[reseed-map-data] Step 5: Creating Customer records...');
    await parallelChunked(CUSTOMER_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, CUSTOMER_SEEDS.length);
      const payload = {
        customer_code: seed.code,
        full_name: seed.fullName,
        email: seed.email,
        phone: seed.phone,
        gender: seed.gender,
        membership_tier: seed.membershipTier,
        points: seed.points,
        city: seed.city,
        registration_date: seed.registrationDate,
        is_active: true,
      };
      await db.dataRecord.create({
        data: {
          moduleId: moduleMap['CUSTOMER_MASTER'],
          companyId: companyByCode['MAPI'].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
    });
    summary.created['Customer'] = CUSTOMER_SEEDS.length;
    summary.steps.push(`Step 5: Created ${CUSTOMER_SEEDS.length} Customer Master records`);
    console.info(`[reseed-map-data] Step 5 complete: ${CUSTOMER_SEEDS.length} customers`);

    // ============================================================
    // STEP 6: CREATE BRAND MASTER RECORDS (6)
    // ============================================================
    console.info('[reseed-map-data] Step 6: Creating Brand records...');
    await parallelChunked(BRAND_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, BRAND_SEEDS.length);
      const payload = {
        brand_code: seed.code,
        brand_name: seed.name,
        brand_category: seed.category,
        country_of_origin: seed.countryOfOrigin,
        website: seed.website,
        description: seed.description,
        is_active: true,
      };
      await db.dataRecord.create({
        data: {
          moduleId: moduleMap['BRAND_MASTER'],
          companyId: companyByCode['MAPI'].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
    });
    summary.created['Brand'] = BRAND_SEEDS.length;
    summary.steps.push(`Step 6: Created ${BRAND_SEEDS.length} Brand Master records`);
    console.info(`[reseed-map-data] Step 6 complete: ${BRAND_SEEDS.length} brands`);

    // ============================================================
    // STEP 7: CREATE PRICING MASTER RECORDS (20)
    // ============================================================
    console.info('[reseed-map-data] Step 7: Creating Pricing records...');
    await parallelChunked(PRICING_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, PRICING_SEEDS.length);
      const companyCode = PRICING_COMPANY_MAP[seed.code] ?? 'MAPD';
      const payload = {
        pricing_code: seed.code,
        article_code: seed.articleCode,
        price_type: seed.priceType,
        price: seed.price,
        currency: seed.currency,
        effective_date: seed.effectiveDate,
        expiry_date: seed.expiryDate,
        store_type: seed.storeType,
        region: seed.region,
      };
      await db.dataRecord.create({
        data: {
          moduleId: moduleMap['PRICING_MASTER'],
          companyId: companyByCode[companyCode].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
    });
    summary.created['Pricing'] = PRICING_SEEDS.length;
    summary.steps.push(`Step 7: Created ${PRICING_SEEDS.length} Pricing Master records`);
    console.info(`[reseed-map-data] Step 7 complete: ${PRICING_SEEDS.length} pricings`);

    // ============================================================
    // STEP 8: CREATE PROMOTION MASTER RECORDS (10)
    // ============================================================
    console.info('[reseed-map-data] Step 8: Creating Promotion records...');
    await parallelChunked(PROMOTION_SEEDS, async (seed, idx) => {
      // Use the status from the seed directly (already valid workflow status)
      const status = seed.status as RecStatus;
      const companyCode = PROMOTION_COMPANY_MAP[seed.code] ?? 'MAPD';
      const payload = {
        promo_code: seed.code,
        promo_name: seed.name,
        promo_type: seed.promoType,
        discount_type: seed.discountType,
        discount_value: seed.discountValue,
        start_date: seed.startDate,
        end_date: seed.endDate,
        applicable_categories: seed.applicableCategories,
        min_purchase: seed.minPurchase,
        max_discount: seed.maxDiscount,
        store_type: seed.storeType,
        status: seed.status,
      };
      await db.dataRecord.create({
        data: {
          moduleId: moduleMap['PROMOTION_MASTER'],
          companyId: companyByCode[companyCode].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
    });
    summary.created['Promotion'] = PROMOTION_SEEDS.length;
    summary.steps.push(`Step 8: Created ${PROMOTION_SEEDS.length} Promotion Master records`);
    console.info(`[reseed-map-data] Step 8 complete: ${PROMOTION_SEEDS.length} promotions`);

    // ============================================================
    // STEP 9: CREATE INVENTORY MASTER RECORDS (15)
    // ============================================================
    console.info('[reseed-map-data] Step 9: Creating Inventory records...');
    await parallelChunked(INVENTORY_SEEDS, async (seed, idx) => {
      const status = pickStatus(idx, INVENTORY_SEEDS.length);
      // Inventory company = store company
      const companyCode = STORE_COMPANY_MAP[seed.storeCode] ?? 'MAPI';
      const payload = {
        inventory_code: seed.code,
        article_code: seed.articleCode,
        store_code: seed.storeCode,
        quantity_on_hand: seed.quantityOnHand,
        quantity_reserved: seed.quantityReserved,
        reorder_point: seed.reorderPoint,
        last_restock_date: seed.lastRestockDate,
        bin_location: seed.binLocation,
        is_active: true,
      };
      await db.dataRecord.create({
        data: {
          moduleId: moduleMap['INVENTORY_MASTER'],
          companyId: companyByCode[companyCode].id,
          status,
          currentPayload: jsonVal(payload),
          version: 1,
          qualityScore: pickQualityScore(status),
          completenessScore: pickCompletenessScore(status),
          createdById: adminId,
          updatedById: adminId,
        },
      });
    });
    summary.created['Inventory'] = INVENTORY_SEEDS.length;
    summary.steps.push(`Step 9: Created ${INVENTORY_SEEDS.length} Inventory Master records`);
    console.info(`[reseed-map-data] Step 9 complete: ${INVENTORY_SEEDS.length} inventories`);

    // ============================================================
    // STEP 10: CREATE IMAGE ASSET RECORDS FOR ARTICLES
    // ============================================================
    console.info('[reseed-map-data] Step 10: Creating ImageAsset records...');
    let imageAssetsCreated = 0;
    const imageAssetData: Array<{
      recordId: string;
      fieldName: string;
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      altText: string;
      sortOrder: number;
      isPrimary: boolean;
    }> = [];

    for (const seed of ARTICLE_SEEDS) {
      const recordInfo = articleRecordByCode[seed.code];
      if (!recordInfo) continue;

      // Primary image
      imageAssetData.push({
        recordId: recordInfo.id,
        fieldName: 'images',
        fileName: `${seed.code.toLowerCase()}-01.webp`,
        filePath: mapclubImageUrl(seed.code, 1),
        fileSize: 45000 + Math.floor(Math.random() * 30000),
        mimeType: 'image/webp',
        altText: `${seed.name} — front view`,
        sortOrder: 0,
        isPrimary: true,
      });

      // Secondary image
      imageAssetData.push({
        recordId: recordInfo.id,
        fieldName: 'images',
        fileName: `${seed.code.toLowerCase()}-02.webp`,
        filePath: mapclubImageUrl(seed.code, 2),
        fileSize: 40000 + Math.floor(Math.random() * 25000),
        mimeType: 'image/webp',
        altText: `${seed.name} — side view`,
        sortOrder: 1,
        isPrimary: false,
      });
    }

    // Batch insert image assets
    for (let i = 0; i < imageAssetData.length; i += 20) {
      const batch = imageAssetData.slice(i, i + 20);
      await db.imageAsset.createMany({ data: batch });
      imageAssetsCreated += batch.length;
    }
    summary.created['ImageAsset'] = imageAssetsCreated;
    summary.steps.push(`Step 10: Created ${imageAssetsCreated} ImageAsset records (2 per article)`);
    console.info(`[reseed-map-data] Step 10 complete: ${imageAssetsCreated} image assets`);

    // ============================================================
    // STEP 11: CREATE DIGITAL ASSET RECORDS FOR ARTICLES
    // ============================================================
    console.info('[reseed-map-data] Step 11: Creating DigitalAsset records...');
    let digitalAssetsCreated = 0;
    const digitalAssetData: Array<{
      companyId: string;
      recordId: string;
      assetType: string;
      fileName: string;
      originalFileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      title: string;
      description: string;
      altText: string;
      width: number;
      height: number;
      status: string;
      category: string;
      sortOrder: number;
      isPrimary: boolean;
    }> = [];

    for (const seed of ARTICLE_SEEDS) {
      const recordInfo = articleRecordByCode[seed.code];
      if (!recordInfo) continue;

      const companyCode = ARTICLE_COMPANY_MAP[seed.code] ?? DEFAULT_ARTICLE_COMPANY;

      // Product hero image
      digitalAssetData.push({
        companyId: companyByCode[companyCode].id,
        recordId: recordInfo.id,
        assetType: 'IMAGE',
        fileName: `${seed.code.toLowerCase()}-hero.webp`,
        originalFileName: `${seed.name.replace(/\s+/g, '_')}_hero.webp`,
        filePath: `https://res.mapclub.com/resources/dam/products/${seed.code.toLowerCase()}/hero.webp`,
        fileSize: 55000 + Math.floor(Math.random() * 40000),
        mimeType: 'image/webp',
        title: `${seed.name} — Hero Image`,
        description: `Professional product hero shot for ${seed.name}`,
        altText: `${seed.name} hero image`,
        width: 1200,
        height: 1200,
        status: 'APPROVED',
        category: seed.category,
        sortOrder: 0,
        isPrimary: true,
      });

      // Product lifestyle image (every 3rd article)
      if (ARTICLE_SEEDS.indexOf(seed) % 3 === 0) {
        digitalAssetData.push({
          companyId: companyByCode[companyCode].id,
          recordId: recordInfo.id,
          assetType: 'IMAGE',
          fileName: `${seed.code.toLowerCase()}-lifestyle.webp`,
          originalFileName: `${seed.name.replace(/\s+/g, '_')}_lifestyle.webp`,
          filePath: `https://res.mapclub.com/resources/dam/products/${seed.code.toLowerCase()}/lifestyle.webp`,
          fileSize: 65000 + Math.floor(Math.random() * 50000),
          mimeType: 'image/webp',
          title: `${seed.name} — Lifestyle Shot`,
          description: `Lifestyle image for ${seed.name} showing product in use`,
          altText: `${seed.name} lifestyle image`,
          width: 1600,
          height: 900,
          status: 'PUBLISHED',
          category: seed.category,
          sortOrder: 1,
          isPrimary: false,
        });
      }
    }

    for (let i = 0; i < digitalAssetData.length; i += 20) {
      const batch = digitalAssetData.slice(i, i + 20);
      await db.digitalAsset.createMany({ data: batch });
      digitalAssetsCreated += batch.length;
    }
    summary.created['DigitalAsset'] = digitalAssetsCreated;
    summary.steps.push(`Step 11: Created ${digitalAssetsCreated} DigitalAsset records`);
    console.info(`[reseed-map-data] Step 11 complete: ${digitalAssetsCreated} digital assets`);

    // ============================================================
    // STEP 12: CREATE HIERARCHY NODES LINKING ARTICLES
    // ============================================================
    console.info('[reseed-map-data] Step 12: Creating HierarchyNode records...');
    let hierarchyNodesCreated = 0;

    // Find existing Product Category Hierarchy
    const productCategoryHierarchies = await db.hierarchyModel.findMany({
      where: { moduleId: moduleMap['CATEGORY_MASTER'] ?? moduleMap['ARTICLE_MASTER'] },
    });

    // Find the Product Category Hierarchy (created by main seed)
    // Try CATEGORY_MASTER first, then ARTICLE_MASTER
    let productHierarchy = productCategoryHierarchies.find(
      (h) => h.hierarchyName === 'Product Category Hierarchy',
    );
    if (!productHierarchy) {
      // Try any hierarchy on CATEGORY_MASTER or ARTICLE_MASTER
      const allHierarchies = await db.hierarchyModel.findMany({
        where: {
          OR: [
            { moduleId: moduleMap['CATEGORY_MASTER'] },
            { moduleId: moduleMap['ARTICLE_MASTER'] },
          ],
        },
      });
      productHierarchy = allHierarchies[0]; // Use first available
    }

    if (productHierarchy) {
      // Find ALL nodes (not just depth 0) to link articles to
      const allNodes = await db.hierarchyNode.findMany({
        where: { hierarchyId: productHierarchy.id },
      });

      console.info(`[reseed-map-data] Found ${allNodes.length} hierarchy nodes. Labels: ${allNodes.map(n => n.nodeLabel).join(', ')}`);

      // Map category codes to hierarchy nodes by label matching
      const categoryNodeMap: Record<string, string> = {};
      for (const node of allNodes) {
        const label = node.nodeLabel.toLowerCase().replace(/[^a-z]/g, '');
        if (label.includes('footwear')) categoryNodeMap['FOOTWEAR'] = node.id;
        else if (label.includes('apparel')) categoryNodeMap['APPAREL'] = node.id;
        else if (label.includes('accessor')) categoryNodeMap['ACCESSORIES'] = node.id;
        else if (label.includes('sport') && !label.includes('outdoor')) categoryNodeMap['SPORTS_EQUIPMENT'] = node.id;
        else if (label.includes('outdoor')) categoryNodeMap['OUTDOOR'] = node.id;
        else if (label.includes('food') || label.includes('beverage') || label.includes('fnb')) categoryNodeMap['FOOD_BEVERAGE'] = node.id;
      }
      console.info(`[reseed-map-data] Category node mapping: ${JSON.stringify(categoryNodeMap)}`);

      // Create hierarchy nodes linking article records to their category
      const hierarchyNodeData: Array<{
        hierarchyId: string;
        recordId: string;
        parentNodeId: string;
        nodeLabel: string;
        materializedPath: string;
        depthLevel: number;
        sortOrder: number;
        isActive: boolean;
        status: string;
      }> = [];

      for (const seed of ARTICLE_SEEDS) {
        const recordInfo = articleRecordByCode[seed.code];
        if (!recordInfo) continue;

        const parentNodeId = categoryNodeMap[seed.category];
        if (!parentNodeId) continue;

        hierarchyNodeData.push({
          hierarchyId: productHierarchy.id,
          recordId: recordInfo.id,
          parentNodeId,
          nodeLabel: seed.name,
          materializedPath: parentNodeId,
          depthLevel: 2, // Leaf level (under category)
          sortOrder: ARTICLE_SEEDS.indexOf(seed),
          isActive: recordInfo.status === 'PUBLISHED' || recordInfo.status === 'APPROVED',
          status: recordInfo.status === 'PUBLISHED' || recordInfo.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
        });
      }

      for (let i = 0; i < hierarchyNodeData.length; i += 20) {
        const batch = hierarchyNodeData.slice(i, i + 20);
        await db.hierarchyNode.createMany({ data: batch });
        hierarchyNodesCreated += batch.length;
      }
    } else {
      console.warn('[reseed-map-data] No Product Category Hierarchy found — skipping article hierarchy linking.');
    }

    summary.created['HierarchyNode'] = hierarchyNodesCreated;
    summary.steps.push(`Step 12: Created ${hierarchyNodesCreated} HierarchyNode records linking articles to category tree`);
    console.info(`[reseed-map-data] Step 12 complete: ${hierarchyNodesCreated} hierarchy nodes`);

    // ============================================================
    // STEP 13: CREATE BUSINESS RULE RECORDS (5)
    // ============================================================
    console.info('[reseed-map-data] Step 13: Creating BusinessRule records...');
    const businessRules = [
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        name: 'Selling Price Must Exceed Purchase Price',
        description: 'Validates that selling_price is greater than purchase_price to prevent margin loss.',
        ruleType: 'CONDITION',
        conditionType: 'CROSS_FIELD',
        conditionJson: jsonVal({ fieldA: 'selling_price', operator: '>', fieldB: 'purchase_price' }),
        actionType: 'BLOCK',
        actionJson: jsonVal({ message: 'Selling price must be greater than purchase price' }),
        errorMessage: 'Selling price must be greater than purchase price',
        severity: 'ERROR',
        trigger: 'SAVE',
        scope: 'RECORD',
        sortOrder: 0,
      },
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        name: 'Sub-Category Must Match Category',
        description: 'Ensures sub_category parentValueCode matches the selected category value.',
        ruleType: 'CONDITION',
        conditionType: 'LOV_CROSS',
        conditionJson: jsonVal({ parentField: 'category', childField: 'sub_category', parentLookupCode: 'CATEGORY', childLookupCode: 'SUB_CATEGORY' }),
        actionType: 'BLOCK',
        actionJson: jsonVal({ message: 'Sub-category does not belong to the selected category' }),
        errorMessage: 'Sub-category must belong to the selected category',
        severity: 'ERROR',
        trigger: 'SAVE',
        scope: 'RECORD',
        sortOrder: 1,
      },
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        name: 'Article Code Uniqueness',
        description: 'Ensures article_code is unique across all records in the module.',
        ruleType: 'CONDITION',
        conditionType: 'UNIQUENESS',
        conditionJson: jsonVal({ field: 'article_code', scope: 'module' }),
        actionType: 'BLOCK',
        actionJson: jsonVal({ message: 'Article code already exists' }),
        errorMessage: 'Article code must be unique',
        severity: 'ERROR',
        trigger: 'SAVE',
        scope: 'BULK',
        sortOrder: 2,
      },
      {
        moduleId: moduleMap['PRICING_MASTER'],
        name: 'Price Must Be Positive',
        description: 'Ensures price field is a positive number.',
        ruleType: 'CONDITION',
        conditionType: 'RANGE',
        conditionJson: jsonVal({ field: 'price', min: 1, operator: '>=' }),
        actionType: 'BLOCK',
        actionJson: jsonVal({ message: 'Price must be a positive number' }),
        errorMessage: 'Price must be greater than 0',
        severity: 'ERROR',
        trigger: 'SAVE',
        scope: 'RECORD',
        sortOrder: 3,
      },
      {
        moduleId: moduleMap['PRICING_MASTER'],
        name: 'Effective Date Before Expiry Date',
        description: 'Ensures effective_date is before expiry_date for pricing records.',
        ruleType: 'CONDITION',
        conditionType: 'CROSS_FIELD',
        conditionJson: jsonVal({ fieldA: 'effective_date', operator: '<', fieldB: 'expiry_date' }),
        actionType: 'BLOCK',
        actionJson: jsonVal({ message: 'Effective date must be before expiry date' }),
        errorMessage: 'Effective date must be before expiry date',
        severity: 'ERROR',
        trigger: 'SAVE',
        scope: 'RECORD',
        sortOrder: 4,
      },
    ];

    await db.businessRule.createMany({ data: businessRules });
    summary.created['BusinessRule'] = businessRules.length;
    summary.steps.push(`Step 13: Created ${businessRules.length} BusinessRule records`);
    console.info(`[reseed-map-data] Step 13 complete: ${businessRules.length} business rules`);

    // ============================================================
    // STEP 14: CREATE STEWARDSHIP TASK RECORDS (8)
    // ============================================================
    console.info('[reseed-map-data] Step 14: Creating StewardshipTask records...');
    const stewardshipTasks = [
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        recordId: articleRecordByCode['ART-017']?.id ?? null,
        taskType: 'QUALITY_REVIEW',
        title: 'Review missing product description — Skechers On-the-GO 600',
        description: 'Article ART-017 is in DRAFT status and needs product description completion before review.',
        priority: 'HIGH',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-08-01'),
        context: jsonVal({ field: 'description', issue: 'EMPTY_REQUIRED_FIELD' }),
      },
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        recordId: articleRecordByCode['ART-022']?.id ?? null,
        taskType: 'QUALITY_REVIEW',
        title: 'Verify product specifications — Columbia Redmond III',
        description: 'Columbia Redmond III is categorized as Boots but may need reclassification to Hiking.',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-07-15'),
        context: jsonVal({ field: 'sub_category', issue: 'POSSIBLE_MISCLASSIFICATION' }),
      },
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        recordId: articleRecordByCode['ART-055']?.id ?? null,
        taskType: 'DATA_CORRECTION',
        title: 'Fix pricing discrepancy — Adidas Dumbbell Set',
        description: 'Purchase price seems too high for a training equipment item, needs verification with supplier.',
        priority: 'NORMAL',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-08-10'),
        context: jsonVal({ field: 'purchase_price', issue: 'OUTLIER_VALUE' }),
      },
      {
        moduleId: moduleMap['STORE_MASTER'],
        recordId: null,
        taskType: 'COMPLETENESS_CHECK',
        title: 'Quarterly store data completeness audit',
        description: 'Review all store records for completeness — check phone, address, and operating hours fields.',
        priority: 'LOW',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-09-01'),
        context: jsonVal({ checkType: 'COMPLETENESS', fields: ['phone', 'address', 'operating_hours'] }),
      },
      {
        moduleId: moduleMap['SUPPLIER_MASTER'],
        recordId: null,
        taskType: 'DATA_CORRECTION',
        title: 'Update supplier tax IDs — annual verification',
        description: 'Annual tax ID verification required for all active suppliers before fiscal year close.',
        priority: 'HIGH',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-12-01'),
        context: jsonVal({ checkType: 'TAX_VERIFICATION', affectedSuppliers: ['SUP-001', 'SUP-002', 'SUP-003'] }),
      },
      {
        moduleId: moduleMap['PRICING_MASTER'],
        recordId: null,
        taskType: 'QUALITY_REVIEW',
        title: 'Audit promotional pricing — Q3 campaigns',
        description: 'Review all promotional pricing records for Q3 to ensure discount values are within policy.',
        priority: 'NORMAL',
        status: 'COMPLETED',
        assignedTo: adminId,
        assignedBy: adminId,
        completedAt: new Date('2024-06-30'),
        resolution: 'All Q3 promotional prices verified — within acceptable range.',
        context: jsonVal({ quarter: 'Q3', year: 2024 }),
      },
      {
        moduleId: moduleMap['ARTICLE_MASTER'],
        recordId: articleRecordByCode['ART-039']?.id ?? null,
        taskType: 'ENRICHMENT',
        title: 'Add size chart — Under Armour HG Compression',
        description: 'Article needs size chart data and additional images for the e-commerce listing.',
        priority: 'LOW',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-08-20'),
        context: jsonVal({ enrichmentType: 'SIZE_CHART', fields: ['images', 'description'] }),
      },
      {
        moduleId: moduleMap['PROMOTION_MASTER'],
        recordId: null,
        taskType: 'QUALITY_REVIEW',
        title: 'Validate promotion category applicability',
        description: 'Ensure all promotions reference valid categories and store types from the current lookup system.',
        priority: 'NORMAL',
        status: 'PENDING',
        assignedTo: adminId,
        assignedBy: adminId,
        dueDate: new Date('2024-07-30'),
        context: jsonVal({ checkType: 'LOV_VALIDATION', fields: ['applicable_categories', 'store_type'] }),
      },
    ];

    // Filter out tasks where recordId is needed but article wasn't created
    // Also filter out tasks with invalid assignedTo/assignedBy (null adminId)
    const validTasks = stewardshipTasks.filter((t) => {
      if (t.assignedTo === null || t.assignedBy === null) return false;
      if (t.recordId === null) return true; // Module-level task
      return t.recordId !== undefined;
    });

    if (validTasks.length > 0) {
      await db.stewardshipTask.createMany({ data: validTasks });
    }
    summary.created['StewardshipTask'] = validTasks.length;
    summary.steps.push(`Step 14: Created ${validTasks.length} StewardshipTask records`);
    console.info(`[reseed-map-data] Step 14 complete: ${validTasks.length} stewardship tasks`);

    // ============================================================
    // STEP 15: CREATE DATA QUALITY SCORE RECORDS (8)
    // ============================================================
    console.info('[reseed-map-data] Step 15: Creating DataQualityScore records...');
    const qualityScores: Array<{
      recordId: string;
      moduleId: string;
      metricType: string;
      metricCode: string | null;
      score: number;
      message: string | null;
    }> = [];

    // Pick 8 representative articles for quality scoring
    const scoredArticles = ['ART-001', 'ART-006', 'ART-010', 'ART-025', 'ART-033', 'ART-048', 'ART-052', 'ART-055'];
    const metricTypes = [
      { metricType: 'OVERALL', metricCode: null },
      { metricType: 'COMPLETENESS', metricCode: 'REQUIRED_FIELDS' },
      { metricType: 'ACCURACY', metricCode: 'CROSS_FIELD_VALIDATION' },
      { metricType: 'CONSISTENCY', metricCode: 'LOV_ALIGNMENT' },
      { metricType: 'TIMELINESS', metricCode: 'DATA_FRESHNESS' },
      { metricType: 'UNIQUENESS', metricCode: 'DUPLICATE_CHECK' },
      { metricType: 'VALIDITY', metricCode: 'FORMAT_CHECK' },
      { metricType: 'OVERALL', metricCode: 'IMAGE_COMPLETENESS' },
    ];

    for (let i = 0; i < scoredArticles.length; i++) {
      const recordInfo = articleRecordByCode[scoredArticles[i]];
      if (!recordInfo) continue;

      const metric = metricTypes[i];
      const baseScore = recordInfo.status === 'PUBLISHED' || recordInfo.status === 'APPROVED'
        ? 80 + Math.floor(Math.random() * 20)
        : 40 + Math.floor(Math.random() * 30);

      const messages: Record<string, string> = {
        'REQUIRED_FIELDS': 'All required fields are populated',
        'CROSS_FIELD_VALIDATION': 'Cross-field validation passed — selling_price > purchase_price',
        'LOV_ALIGNMENT': 'Category and sub-category are properly aligned',
        'DATA_FRESHNESS': 'Record updated within the last 30 days',
        'DUPLICATE_CHECK': 'No duplicate article codes detected',
        'FORMAT_CHECK': 'All field formats are valid',
        'IMAGE_COMPLETENESS': 'Primary image present, 1 additional image available',
      };

      qualityScores.push({
        recordId: recordInfo.id,
        moduleId: moduleMap['ARTICLE_MASTER'],
        metricType: metric.metricType,
        metricCode: metric.metricCode,
        score: baseScore,
        message: messages[metric.metricCode ?? ''] ?? `Overall quality score: ${baseScore}/100`,
      });
    }

    if (qualityScores.length > 0) {
      await db.dataQualityScore.createMany({ data: qualityScores });
    }
    summary.created['DataQualityScore'] = qualityScores.length;
    summary.steps.push(`Step 15: Created ${qualityScores.length} DataQualityScore records`);
    console.info(`[reseed-map-data] Step 15 complete: ${qualityScores.length} quality scores`);

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    const totalCreated = Object.values(summary.created).reduce((a, b) => a + b, 0);
    const totalDeleted = Object.values(summary.deleted).reduce((a, b) => a + b, 0);

    const result = {
      success: true,
      message: `Reseed complete: deleted ${totalDeleted} existing records, created ${totalCreated} new records`,
      deleted: summary.deleted,
      created: summary.created,
      steps: summary.steps,
      totals: {
        articles: ARTICLE_SEEDS.length,
        stores: STORE_SEEDS.length,
        suppliers: SUPPLIER_SEEDS.length,
        customers: CUSTOMER_SEEDS.length,
        brands: BRAND_SEEDS.length,
        pricings: PRICING_SEEDS.length,
        promotions: PROMOTION_SEEDS.length,
        inventories: INVENTORY_SEEDS.length,
        imageAssets: imageAssetsCreated,
        digitalAssets: digitalAssetsCreated,
        hierarchyNodes: hierarchyNodesCreated,
        businessRules: businessRules.length,
        stewardshipTasks: validTasks.length,
        dataQualityScores: qualityScores.length,
      },
    };

    console.info(`[reseed-map-data] Complete! Total created: ${totalCreated}, Total deleted: ${totalDeleted}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[reseed-map-data] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during reseed';
    return NextResponse.json(
      { error: 'Reseed failed', details: message },
      { status: 500 },
    );
  }
}
