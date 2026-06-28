import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

// ============================================================
// POST /api/admin/reseed-map-data
// ------------------------------------------------------------
// Idempotent admin migration that REPLACES all sample master data
// in the five retail modules (ARTICLE_MASTER, STORE_MASTER,
// SUPPLIER_MASTER, PRICING_MASTER, PROMOTION_MASTER) with realistic
// MAP Active (PT Mitra Adiperkasa Tbk) e-commerce data inspired by
// https://www.mapclub.com.
//
// Categories use English mapclub.com taxonomy:
//   FOOTWEAR, APPAREL, ACCESSORIES, SPORTS_EQUIPMENT, OUTDOOR
//
// What this endpoint does (idempotent — safe to re-run):
//   Step 1. Wipe existing sample data for the 5 retail modules
//   Step 2. Refresh lookups with mapclub-inspired taxonomy
//   Step 3. Recreate Article Hierarchy with 3-level tree
//   Step 4. Create 55 Article + 20 Store + 12 Supplier +
//           20 Pricing + 12 Promotion records
//   Step 5. Create ImageAsset records
//   Step 6. Return summary + log audit entry
//
// Auth: Super Admin only
// ============================================================

// ── Type definitions for the inline seed data ──────────────────
interface ArticleSeed {
  code: string;
  name: string;
  category: string;
  subCategory: string;
  brand: string;
  purchasePrice: number;
  sellingPrice: number;
  tags: string;
  description: string;
  status: 'ACTIVE' | 'DRAFT' | 'IN_REVIEW' | 'REVISION_PENDING';
}

interface StoreSeed {
  code: string;
  name: string;
  region: string;
  city: string;
  address: string;
  phone: string;
  storeType: string;
  openingDate: string;
  status: 'ACTIVE' | 'DRAFT' | 'IN_REVIEW';
}

interface SupplierSeed {
  code: string;
  name: string;
  type: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  taxId: string;
  paymentTerms: string;
  status: 'ACTIVE' | 'DRAFT' | 'IN_REVIEW';
}

interface PricingSeed {
  code: string;
  articleCode: string;
  priceType: string;
  price: number;
  currency: string;
  effectiveDate: string;
  expiryDate: string;
  storeType: string;
  region: string;
}

interface PromotionSeed {
  code: string;
  name: string;
  promoType: string;
  discountType: string;
  discountValue: number;
  startDate: string;
  endDate: string;
  applicableCategories: string;
  minPurchase: number;
  maxDiscount: number;
  storeType: string;
  status: 'ACTIVE' | 'DRAFT' | 'IN_REVIEW';
}

// ── Article seed data (55 records, MAP Active / mapclub.com catalog) ──
// Statuses: 38 ACTIVE + 8 DRAFT + 6 IN_REVIEW + 3 REVISION_PENDING = 55
// Categories: FOOTWEAR, APPAREL, ACCESSORIES, SPORTS_EQUIPMENT, OUTDOOR
const ARTICLE_SEEDS: ArticleSeed[] = [
  // ─── FOOTWEAR → Running Shoes (5) ───
  { code: 'ART-001', name: 'Nike Air Zoom Pegasus 40', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Nike', purchasePrice: 1200000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — lightweight running shoe with responsive ZoomX cushioning for daily training and marathon prep.', status: 'ACTIVE' },
  { code: 'ART-002', name: 'Adidas Ultraboost Light', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Adidas', purchasePrice: 2200000, sellingPrice: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Adidas Ultraboost Light with the lightest BOOST midsole ever created, energy return for every stride.', status: 'ACTIVE' },
  { code: 'ART-003', name: 'Asics Gel-Kayano 30', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Asics', purchasePrice: 1800000, sellingPrice: 2799000, tags: 'BEST_SELLER', description: 'Asics Gel-Kayano 30 with 4D Guidance System for stability runners who need premium support.', status: 'ACTIVE' },
  { code: 'ART-004', name: 'New Balance Fresh Foam X 1080v13', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'New Balance', purchasePrice: 1650000, sellingPrice: 2499000, tags: 'FEATURED', description: 'New Balance 1080v13 with Fresh Foam X midsole — the pinnacle of cushioned running experience.', status: 'ACTIVE' },
  { code: 'ART-005', name: 'Reebok Floatride Energy 4', category: 'FOOTWEAR', subCategory: 'RUNNING_SHOES', brand: 'Reebok', purchasePrice: 950000, sellingPrice: 1499000, tags: 'SALE', description: 'Reebok Floatride Energy 4 with Floatride Energy Foam for a smooth and responsive ride.', status: 'ACTIVE' },

  // ─── FOOTWEAR → Basketball Shoes (4) ───
  { code: 'ART-006', name: 'Nike Air Jordan 1 Retro High OG', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Jordan', purchasePrice: 2500000, sellingPrice: 3899000, tags: 'EXCLUSIVE,PREMIUM', description: 'Air Jordan 1 Retro High OG — the icon that started it all, premium leather construction.', status: 'ACTIVE' },
  { code: 'ART-007', name: 'Adidas Harden Stepback 3', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Adidas', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'BEST_SELLER', description: 'Adidas Harden Stepback 3 with Light Strike cushioning for quick court moves.', status: 'ACTIVE' },
  { code: 'ART-008', name: 'Nike LeBron XXI', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Nike', purchasePrice: 2800000, sellingPrice: 4299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Nike LeBron XXI with Zoom Air Strobel and cable containment system for elite performance.', status: 'ACTIVE' },
  { code: 'ART-009', name: 'Puma MB.02 LaFrancé', category: 'FOOTWEAR', subCategory: 'BASKETBALL_SHOES', brand: 'Puma', purchasePrice: 1500000, sellingPrice: 2299000, tags: 'NEW_ARRIVAL', description: 'Puma MB.02 LaFrancé with NITRO Foam for explosive basketball performance.', status: 'IN_REVIEW' },

  // ─── FOOTWEAR → Casual Sneakers (5) ───
  { code: 'ART-010', name: 'Converse Chuck 70 High', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Converse', purchasePrice: 850000, sellingPrice: 1299000, tags: 'BEST_SELLER', description: 'Converse Chuck 70 High-top classic with premium canvas and OrthoLite insole.', status: 'ACTIVE' },
  { code: 'ART-011', name: 'Vans Old Skool', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Vans', purchasePrice: 720000, sellingPrice: 1099000, tags: 'BEST_SELLER', description: 'Vans Old Skool with iconic side stripe, classic skateboard heritage since 1977.', status: 'ACTIVE' },
  { code: 'ART-012', name: 'Nike Air Force 1 \'07', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Nike', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'BEST_SELLER,FEATURED', description: 'Nike Air Force 1 \'07 white classic, the streetwear icon since 1982.', status: 'ACTIVE' },
  { code: 'ART-013', name: 'Adidas Samba OG', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Adidas', purchasePrice: 980000, sellingPrice: 1599000, tags: 'EXCLUSIVE', description: 'Adidas Samba OG original edition, premium suede upper with classic gum sole.', status: 'ACTIVE' },
  { code: 'ART-014', name: 'Fila Disruptor II Premium', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Fila', purchasePrice: 680000, sellingPrice: 999000, tags: 'SALE', description: 'Fila Disruptor II Premium chunky sneaker with thick midsole and leather upper.', status: 'ACTIVE' },

  // ─── FOOTWEAR → Sandals (3) ───
  { code: 'ART-015', name: 'Adidas Adilette Slide', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Adidas', purchasePrice: 350000, sellingPrice: 549000, tags: 'BEST_SELLER', description: 'Adidas Adilette slide sandals with contoured footbed and quick-dry bandage upper.', status: 'ACTIVE' },
  { code: 'ART-016', name: 'Nike Benassi JDI', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Nike', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Nike Benassi Just Do It slide sandals with synthetic strap and Phylon midsole.', status: 'ACTIVE' },
  { code: 'ART-017', name: 'Skechers On-the-GO 600', category: 'FOOTWEAR', subCategory: 'SANDALS', brand: 'Skechers', purchasePrice: 420000, sellingPrice: 699000, tags: 'NEW_ARRIVAL', description: 'Skechers On-the-GO 600 sandal with Goga Mat pillar technology for all-day comfort.', status: 'DRAFT' },

  // ─── FOOTWEAR → Formal Shoes (2) ───
  { code: 'ART-018', name: 'Timberland Classic 3-Eye Lug', category: 'FOOTWEAR', subCategory: 'FORMAL_SHOES', brand: 'Timberland', purchasePrice: 1950000, sellingPrice: 2999000, tags: 'PREMIUM', description: 'Timberland Classic 3-Eye Lug boat shoe with premium leather and handstitched construction.', status: 'ACTIVE' },
  { code: 'ART-019', name: 'Columbia Redmond III Leather', category: 'FOOTWEAR', subCategory: 'FORMAL_SHOES', brand: 'Columbia', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'FEATURED', description: 'Columbia Redmond III leather hiking shoe with Omni-Grip traction and waterproof construction.', status: 'IN_REVIEW' },

  // ─── FOOTWEAR → Training Shoes (3) ───
  { code: 'ART-020', name: 'Nike Metcon 9', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Nike', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Metcon 9 training shoe with Hyperlift insert and flexibleNike Free technology for versatile workouts.', status: 'ACTIVE' },
  { code: 'ART-021', name: 'Under Armour TriBase Reign 5', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Under Armour', purchasePrice: 1350000, sellingPrice: 1999000, tags: 'FEATURED', description: 'Under Armour TriBase Reign 5 with Micro G foam and external heel clamp for cross-training stability.', status: 'ACTIVE' },
  { code: 'ART-022', name: 'Reebok Nano X4', category: 'FOOTWEAR', subCategory: 'TRAINING_SHOES', brand: 'Reebok', purchasePrice: 1500000, sellingPrice: 2299000, tags: 'PREMIUM', description: 'Reebok Nano X4 with Flexweave upper and Floatride Energy Foam for the ultimate training experience.', status: 'DRAFT' },

  // ─── APPAREL → T-Shirts (5) ───
  { code: 'ART-023', name: 'Nike Dri-FIT Miler Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Nike', purchasePrice: 280000, sellingPrice: 449000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT Miler running tee with moisture-wicking fabric and reflective elements.', status: 'ACTIVE' },
  { code: 'ART-024', name: 'Adidas Own The Run Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Adidas', purchasePrice: 320000, sellingPrice: 499000, tags: 'NEW_ARRIVAL', description: 'Adidas Own The Run tee with AEROREADY technology for moisture management during runs.', status: 'ACTIVE' },
  { code: 'ART-025', name: 'Under Armour Tech 2.0 Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Under Armour', purchasePrice: 300000, sellingPrice: 479000, tags: 'BEST_SELLER', description: 'Under Armour Tech 2.0 short-sleeve tee with UA Tech fabric for ultra-soft comfort.', status: 'ACTIVE' },
  { code: 'ART-026', name: 'Puma Active Crew Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Puma', purchasePrice: 250000, sellingPrice: 399000, tags: 'SALE', description: 'Puma Active crew neck tee with dryCELL moisture-wicking technology for everyday training.', status: 'ACTIVE' },
  { code: 'ART-027', name: 'Skechers Performance Tee', category: 'APPAREL', subCategory: 'T_SHIRTS', brand: 'Skechers', purchasePrice: 180000, sellingPrice: 299000, tags: 'FEATURED', description: 'Skechers Performance tee with ICONTROL moisture management and 4-way stretch fabric.', status: 'DRAFT' },

  // ─── APPAREL → Hoodies (3) ───
  { code: 'ART-028', name: 'Nike Sportswear Club Fleece Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'Nike', purchasePrice: 550000, sellingPrice: 849000, tags: 'BEST_SELLER', description: 'Nike Sportswear Club Fleece hoodie with brushed interior for cozy warmth and classic Swoosh style.', status: 'ACTIVE' },
  { code: 'ART-029', name: 'Adidas Trefoil Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'Adidas', purchasePrice: 620000, sellingPrice: 949000, tags: 'FEATURED', description: 'Adidas Trefoil hoodie with cotton French terry and the iconic Trefoil logo.', status: 'ACTIVE' },
  { code: 'ART-030', name: 'The North Face Glacier Hoodie', category: 'APPAREL', subCategory: 'HOODIES', brand: 'The North Face', purchasePrice: 580000, sellingPrice: 899000, tags: 'NEW_ARRIVAL', description: 'The North Face Glacier hoodie with recycled fleece for lightweight warmth on the trail.', status: 'IN_REVIEW' },

  // ─── APPAREL → Jackets (3) ───
  { code: 'ART-031', name: 'The North Face Venture 2 Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'The North Face', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'PREMIUM,BEST_SELLER', description: 'The North Face Venture 2 waterproof jacket with DryVent 2.5L technology for year-round protection.', status: 'ACTIVE' },
  { code: 'ART-032', name: 'Columbia Watertight II Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'Columbia', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'FEATURED', description: 'Columbia Watertight II jacket with Omni-Tech waterproof-breathable technology and packable design.', status: 'ACTIVE' },
  { code: 'ART-033', name: 'Adidas Terrex Wind Jacket', category: 'APPAREL', subCategory: 'JACKETS', brand: 'Adidas', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL', description: 'Adidas Terrex wind jacket with WIND.RDY technology for lightweight protection on the trail.', status: 'DRAFT' },

  // ─── APPAREL → Pants (3) ───
  { code: 'ART-034', name: 'Nike Sportswear Club Joggers', category: 'APPAREL', subCategory: 'PANTS', brand: 'Nike', purchasePrice: 480000, sellingPrice: 749000, tags: 'BEST_SELLER', description: 'Nike Sportswear Club fleece joggers with tapered fit and elastic cuffs for casual comfort.', status: 'ACTIVE' },
  { code: 'ART-035', name: 'Under Armour Launch Tapered Pants', category: 'APPAREL', subCategory: 'PANTS', brand: 'Under Armour', purchasePrice: 520000, sellingPrice: 799000, tags: 'FEATURED', description: 'Under Armour Launch tapered pants with UA Storm technology for water-resistant performance.', status: 'ACTIVE' },
  { code: 'ART-036', name: 'Puma Essentials Track Pants', category: 'APPAREL', subCategory: 'PANTS', brand: 'Puma', purchasePrice: 380000, sellingPrice: 599000, tags: 'SALE', description: 'Puma Essentials track pants with dryCELL technology and relaxed fit for training comfort.', status: 'DRAFT' },

  // ─── APPAREL → Shorts (2) ───
  { code: 'ART-037', name: 'Nike Flex Stride Running Shorts', category: 'APPAREL', subCategory: 'SHORTS', brand: 'Nike', purchasePrice: 320000, sellingPrice: 499000, tags: 'BEST_SELLER', description: 'Nike Flex Stride running shorts with built-in briefs and Dri-FIT technology.', status: 'ACTIVE' },
  { code: 'ART-038', name: 'Adidas Run It Short', category: 'APPAREL', subCategory: 'SHORTS', brand: 'Adidas', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Adidas Run It shorts with AEROREADY technology and reflective details for running.', status: 'IN_REVIEW' },

  // ─── APPAREL → Compression Wear (2) ───
  { code: 'ART-039', name: 'Under Armour HG Compression', category: 'APPAREL', subCategory: 'COMPRESSION_WEAR', brand: 'Under Armour', purchasePrice: 420000, sellingPrice: 649000, tags: 'PREMIUM', description: 'Under Armour HeatGear compression shirt with super-light fabric and strategic mesh panels.', status: 'ACTIVE' },
  { code: 'ART-040', name: 'Skechers Go Compression Tight', category: 'APPAREL', subCategory: 'COMPRESSION_WEAR', brand: 'Skechers', purchasePrice: 350000, sellingPrice: 549000, tags: 'NEW_ARRIVAL', description: 'Skechers Go Compression tight with targeted compression zones and moisture-wicking fabric.', status: 'IN_REVIEW' },

  // ─── ACCESSORIES → Bags (3) ───
  { code: 'ART-041', name: 'Nike Brasilia Training Duffel', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'Nike', purchasePrice: 480000, sellingPrice: 749000, tags: 'BEST_SELLER', description: 'Nike Brasilia training duffel bag with spacious main compartment and ventilated shoe pocket.', status: 'ACTIVE' },
  { code: 'ART-042', name: 'Adidas Tiro League Backpack', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'Adidas', purchasePrice: 520000, sellingPrice: 799000, tags: 'FEATURED', description: 'Adidas Tiro League backpack with laptop compartment and Primegreen recycled materials.', status: 'ACTIVE' },
  { code: 'ART-043', name: 'The North Face Borealis Backpack', category: 'ACCESSORIES', subCategory: 'BAGS', brand: 'The North Face', purchasePrice: 850000, sellingPrice: 1299000, tags: 'PREMIUM,BEST_SELLER', description: 'The North Face Borealis 28L backpack with FlexVent suspension system and laptop sleeve.', status: 'ACTIVE' },

  // ─── ACCESSORIES → Hats (2) ───
  { code: 'ART-044', name: 'Nike Dri-FIT AeroBill Cap', category: 'ACCESSORIES', subCategory: 'HATS', brand: 'Nike', purchasePrice: 220000, sellingPrice: 349000, tags: 'BEST_SELLER', description: 'Nike Dri-FIT AeroBill cap with moisture-wicking sweatband and adjustable closure.', status: 'ACTIVE' },
  { code: 'ART-045', name: 'New Essence Trucker Cap', category: 'ACCESSORIES', subCategory: 'HATS', brand: 'New Balance', purchasePrice: 180000, sellingPrice: 299000, tags: 'FEATURED', description: 'New Balance trucker cap with mesh back panels and embroidered NB logo.', status: 'DRAFT' },

  // ─── ACCESSORIES → Socks (2) ───
  { code: 'ART-046', name: 'Nike Everyday Plus Cushion Socks 3-Pack', category: 'ACCESSORIES', subCategory: 'SOCKS', brand: 'Nike', purchasePrice: 120000, sellingPrice: 199000, tags: 'BEST_SELLER', description: 'Nike Everyday Plus cushioned training socks in a 3-pack with Dri-FIT technology.', status: 'ACTIVE' },
  { code: 'ART-047', name: 'Adidas Traxion Running Socks', category: 'ACCESSORIES', subCategory: 'SOCKS', brand: 'Adidas', purchasePrice: 95000, sellingPrice: 159000, tags: 'SALE', description: 'Adidas Traxion running socks with arch compression and moisture-wicking yarn.', status: 'ACTIVE' },

  // ─── ACCESSORIES → Watches (2) ───
  { code: 'ART-048', name: 'Casio G-Shock GA-2100 "Casioak"', category: 'ACCESSORIES', subCategory: 'WATCHES', brand: 'Casio', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Casio G-Shock GA-2100 with carbon core guard structure and minimalist octagonal bezel.', status: 'ACTIVE' },
  { code: 'ART-049', name: 'Timberland TBL.5144 Field Watch', category: 'ACCESSORIES', subCategory: 'WATCHES', brand: 'Timberland', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'FEATURED', description: 'Timberland TBL.5144 field watch with stainless steel case and genuine leather strap.', status: 'IN_REVIEW' },

  // ─── ACCESSORIES → Sunglasses (1) ───
  { code: 'ART-050', name: 'Nike Vision Wings Shield', category: 'ACCESSORIES', subCategory: 'SUNGLASSES', brand: 'Nike', purchasePrice: 780000, sellingPrice: 1199000, tags: 'NEW_ARRIVAL', description: 'Nike Vision Wings shield sunglasses with Nike Optics for distortion-free vision and UV400 protection.', status: 'ACTIVE' },

  // ─── ACCESSORIES → Belts (1) ───
  { code: 'ART-051', name: 'Columbia Leather Hiking Belt', category: 'ACCESSORIES', subCategory: 'BELTS', brand: 'Columbia', purchasePrice: 280000, sellingPrice: 449000, tags: 'FEATURED', description: 'Columbia genuine leather hiking belt with durable metal buckle and reinforced holes.', status: 'ACTIVE' },

  // ─── SPORTS EQUIPMENT → Basketball (2) ───
  { code: 'ART-052', name: 'Spalding NBA Official Game Ball', category: 'SPORTS_EQUIPMENT', subCategory: 'BASKETBALL', brand: 'Spalding', purchasePrice: 1250000, sellingPrice: 1899000, tags: 'PREMIUM,EXCLUSIVE', description: 'Spalding NBA official game basketball with full-grain Horween leather construction.', status: 'ACTIVE' },
  { code: 'ART-053', name: 'Nike Elite Competition Basketball', category: 'SPORTS_EQUIPMENT', subCategory: 'BASKETBALL', brand: 'Nike', purchasePrice: 650000, sellingPrice: 999000, tags: 'BEST_SELLER', description: 'Nike Elite competition basketball with composite leather and deep channel design for superior grip.', status: 'ACTIVE' },

  // ─── SPORTS EQUIPMENT → Football (1) ───
  { code: 'ART-054', name: 'Adidas UCL League Ball 23/24', category: 'SPORTS_EQUIPMENT', subCategory: 'FOOTBALL', brand: 'Adidas', purchasePrice: 950000, sellingPrice: 1499000, tags: 'NEW_ARRIVAL,FEATURED', description: 'Adidas UEFA Champions League official match ball with thermally bonded seamless construction.', status: 'ACTIVE' },

  // ─── SPORTS EQUIPMENT → Tennis (1) ───
  { code: 'ART-055', name: 'Wilson Pro Staff RF97 V14', category: 'SPORTS_EQUIPMENT', subCategory: 'TENNIS', brand: 'Wilson', purchasePrice: 2200000, sellingPrice: 3299000, tags: 'PREMIUM,EXCLUSIVE', description: 'Wilson Pro Staff RF97 V14 racket — Roger Federer signature with braided graphite and Kevlar.', status: 'REVISION_PENDING' },

  // ─── SPORTS EQUIPMENT → Swimming (1) ───
  { code: 'ART-056', name: 'Speedo Fastskin LZR Pure Intent', category: 'SPORTS_EQUIPMENT', subCategory: 'SWIMMING', brand: 'Speedo', purchasePrice: 3200000, sellingPrice: 4999000, tags: 'PREMIUM,EXCLUSIVE', description: 'Speedo Fastskin LZR Pure Intent competition swimsuit with intelligent compression zones.', status: 'ACTIVE' },

  // ─── SPORTS EQUIPMENT → Yoga (1) ───
  { code: 'ART-057', name: 'Manduka PRO Yoga Mat 71"', category: 'SPORTS_EQUIPMENT', subCategory: 'YOGA', brand: 'Manduka', purchasePrice: 850000, sellingPrice: 1299000, tags: 'PREMIUM,BEST_SELLER', description: 'Manduka PRO yoga mat with 6mm cushioning and lifetime guarantee — the gold standard for practice.', status: 'IN_REVIEW' },

  // ─── SPORTS EQUIPMENT → Gym Equipment (1) ───
  { code: 'ART-058', name: 'Adidas Adjustable Dumbbell Set 24kg', category: 'SPORTS_EQUIPMENT', subCategory: 'GYM_EQUIPMENT', brand: 'Adidas', purchasePrice: 2800000, sellingPrice: 4299000, tags: 'PREMIUM,FEATURED', description: 'Adidas adjustable dumbbell set 24kg with quick-change weight mechanism and rubber-coated grip.', status: 'DRAFT' },

  // ─── OUTDOOR → Camping (1) ───
  { code: 'ART-059', name: 'The North Face Wawona 6 Tent', category: 'OUTDOOR', subCategory: 'CAMPING', brand: 'The North Face', purchasePrice: 5500000, sellingPrice: 8499000, tags: 'PREMIUM,EXCLUSIVE', description: 'The North Face Wawona 6-person tent with hybrid double-wall construction and massive vestibule.', status: 'ACTIVE' },

  // ─── OUTDOOR → Hiking (1) ───
  { code: 'ART-060', name: 'Columbia Peakfreak XCRSN II', category: 'OUTDOOR', subCategory: 'HIKING', brand: 'Columbia', purchasePrice: 1350000, sellingPrice: 2099000, tags: 'BEST_SELLER', description: 'Columbia Peakfreak XCRSN II hiking shoe with OutDry waterproof construction and Navic Fit System.', status: 'ACTIVE' },

  // ─── OUTDOOR → Cycling (1) ───
  { code: 'ART-061', name: 'Puma x Dimbmba Cycling Jersey', category: 'OUTDOOR', subCategory: 'CYCLING', brand: 'Puma', purchasePrice: 680000, sellingPrice: 1049000, tags: 'LIMITED,NEW_ARRIVAL', description: 'Puma x Dimbmba limited-edition cycling jersey with dryCELL moisture management and aerodynamic fit.', status: 'REVISION_PENDING' },

  // ─── OUTDOOR → Running Gear (1) ───
  { code: 'ART-062', name: 'Nike Running Hydration Vest', category: 'OUTDOOR', subCategory: 'RUNNING_GEAR', brand: 'Nike', purchasePrice: 780000, sellingPrice: 1199000, tags: 'NEW_ARRIVAL', description: 'Nike running hydration vest with 5L capacity, 2 soft flasks, and breathable mesh construction.', status: 'DRAFT' },

  // ─── EXTRA FOOTWEAR for volume (3 DRAFT) ───
  { code: 'ART-063', name: 'Skechers D\'Lites 3', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'Skechers', purchasePrice: 750000, sellingPrice: 1199000, tags: 'BEST_SELLER,SALE', description: 'Skechers D\'Lites 3 with Air Cooled Goga Mat insole for all-day comfort.', status: 'DRAFT' },
  { code: 'ART-064', name: 'New Balance 530', category: 'FOOTWEAR', subCategory: 'CASUAL_SNEAKERS', brand: 'New Balance', purchasePrice: 920000, sellingPrice: 1499000, tags: 'BEST_SELLER', description: 'New Balance 530 with ABZORB cushioning and premium mesh-suede upper.', status: 'IN_REVIEW' },
  { code: 'ART-065', name: 'Timberland 6-Inch Premium Boot', category: 'FOOTWEAR', subCategory: 'FORMAL_SHOES', brand: 'Timberland', purchasePrice: 2100000, sellingPrice: 3299000, tags: 'PREMIUM,EXCLUSIVE', description: 'Timberland 6-Inch Premium waterproof boot with nubuck leather and anti-fatigue technology.', status: 'REVISION_PENDING' },
];

// ── Store seed data (20 MAP mall / retail locations across Indonesia) ──
const STORE_SEEDS: StoreSeed[] = [
  { code: 'STR-001', name: 'mapclub Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1', phone: '+62212555789', storeType: 'HYPERMARKET', openingDate: '2010-05-15', status: 'ACTIVE' },
  { code: 'STR-002', name: 'mapclub Pondok Indah Mall', region: 'JABODETABEK', city: 'Jakarta', address: 'Pondok Indah Mall Lt.2, Jl. Metro Pondok Indah', phone: '+62212789012', storeType: 'SUPERMARKET', openingDate: '2011-08-22', status: 'ACTIVE' },
  { code: 'STR-003', name: 'mapclub Tunjungan Plaza Surabaya', region: 'EAST_JAVA', city: 'Surabaya', address: 'Tunjungan Plaza Lt.3, Jl. Tunjungan No. 65-71', phone: '+62315678901', storeType: 'HYPERMARKET', openingDate: '2012-11-30', status: 'ACTIVE' },
  { code: 'STR-004', name: 'Nike Plaza Indonesia', region: 'JABODETABEK', city: 'Jakarta', address: 'Plaza Indonesia Lt.2, Jl. MH Thamrin Kav. 28-30', phone: '+62212903456', storeType: 'SPECIALTY', openingDate: '2008-10-05', status: 'ACTIVE' },
  { code: 'STR-005', name: 'mapclub Mal Taman Anggrek', region: 'JABODETABEK', city: 'Jakarta', address: 'Mal Taman Anggrek Lt.1, Jl. Letjen S. Parman Kav. 21', phone: '+62215678123', storeType: 'HYPERMARKET', openingDate: '2014-12-01', status: 'ACTIVE' },
  { code: 'STR-006', name: 'mapclub Bandung Indah Plaza', region: 'WEST_JAVA', city: 'Bandung', address: 'Bandung Indah Plaza Lt.1, Jl. Merdeka No. 60', phone: '+62224567890', storeType: 'SUPERMARKET', openingDate: '2015-06-12', status: 'ACTIVE' },
  { code: 'STR-007', name: 'mapclub Mal Kelapa Gading', region: 'JABODETABEK', city: 'Jakarta', address: 'Mal Kelapa Gading Lt.2, Jl. Boulevard Kelapa Gading', phone: '+62214580123', storeType: 'HYPERMARKET', openingDate: '2017-04-14', status: 'ACTIVE' },
  { code: 'STR-008', name: 'Nike Bali Collection', region: 'BALI_NT', city: 'Kuta', address: 'Bali Collection Lt.1, Jl. By Pass Ngurah Rai, Nusa Dua', phone: '+62361789012', storeType: 'SPECIALTY', openingDate: '2018-07-30', status: 'ACTIVE' },
  { code: 'STR-009', name: 'mapclub Trans Studio Mall Makassar', region: 'SULAWESI', city: 'Makassar', address: 'Trans Studio Mall Lt.1, Jl. Metro Tanjung Bunga', phone: '+62411890123', storeType: 'SUPERMARKET', openingDate: '2019-11-08', status: 'ACTIVE' },
  { code: 'STR-010', name: 'Adidas Pacific Place', region: 'JABODETABEK', city: 'Jakarta', address: 'Pacific Place Mall Lt.G, Jl. SCBD No.1', phone: '+62212555432', storeType: 'SPECIALTY', openingDate: '2009-03-10', status: 'ACTIVE' },
  { code: 'STR-011', name: 'The North Face Pondok Indah Mall 2', region: 'JABODETABEK', city: 'Jakarta', address: 'PIM 2 Lt.2, Jl. Metro Pondok Indah Kav. III', phone: '+62212755001', storeType: 'SPECIALTY', openingDate: '2020-02-14', status: 'ACTIVE' },
  { code: 'STR-012', name: 'mapclub Mal Ciputra Surabaya', region: 'EAST_JAVA', city: 'Surabaya', address: 'Mal Ciputra World Lt.2, Jl. Mayjen Sungkono', phone: '+62315678002', storeType: 'HYPERMARKET', openingDate: '2016-03-20', status: 'ACTIVE' },
  { code: 'STR-013', name: 'Nike Central Park Mall', region: 'JABODETABEK', city: 'Jakarta', address: 'Central Park Mall Lt.1, Jl. Letjen S. Parman', phone: '+62215671111', storeType: 'SPECIALTY', openingDate: '2021-06-01', status: 'ACTIVE' },
  { code: 'STR-014', name: 'mapclub Living World Alam Sutera', region: 'JABODETABEK', city: 'Tangerang', address: 'Living World Mall Lt.1, Jl. Alam Sutera Blvd. Kav. 21', phone: '+62212930100', storeType: 'HYPERMARKET', openingDate: '2018-09-15', status: 'ACTIVE' },
  { code: 'STR-015', name: 'mapclub Paragon Mall Semarang', region: 'CENTRAL_JAVA', city: 'Semarang', address: 'Paragon Mall Lt.1, Jl. Pemuda No. 118', phone: '+62244701001', storeType: 'SUPERMARKET', openingDate: '2019-12-20', status: 'ACTIVE' },
  { code: 'STR-016', name: 'Puma Avenue Bali', region: 'BALI_NT', city: 'Denpasar', address: 'Bali Mall Galeria Lt.1, Jl. Bypass Ngurah Rai', phone: '+62361478001', storeType: 'SPECIALTY', openingDate: '2020-08-10', status: 'ACTIVE' },
  { code: 'STR-017', name: 'mapclub Mal PVJ Bandung', region: 'WEST_JAVA', city: 'Bandung', address: 'Paris Van Java Mall Lt.1, Jl. Sukajadi No. 131-139', phone: '+62222061101', storeType: 'SUPERMARKET', openingDate: '2017-07-25', status: 'ACTIVE' },
  { code: 'STR-018', name: 'Nike Mal Matahari Denpasar', region: 'BALI_NT', city: 'Denpasar', address: 'Matahari Dept Store Lt.1, Jl. Teuku Umar', phone: '+62361485001', storeType: 'SPECIALTY', openingDate: '2022-01-15', status: 'IN_REVIEW' },
  { code: 'STR-019', name: 'mapclub City of Tomorrow Surabaya', region: 'EAST_JAVA', city: 'Surabaya', address: 'City of Tomorrow Mall Lt.1, Jl. Ahmad Yani No. 286', phone: '+62315991001', storeType: 'SUPERMARKET', openingDate: '2023-03-10', status: 'DRAFT' },
  { code: 'STR-020', name: 'Columbia Summarecon Mall Serpong', region: 'JABODETABEK', city: 'Tangerang', address: 'Summarecon Mall Lt.1, Jl. Boulevard Raya Gading Serpong', phone: '+62212925001', storeType: 'SPECIALTY', openingDate: '2022-11-20', status: 'ACTIVE' },
];

// ── Supplier seed data (12 brand distributors / suppliers) ──
const SUPPLIER_SEEDS: SupplierSeed[] = [
  { code: 'SUP-001', name: 'PT Nike Indonesia', type: 'MANUFACTURER', contact: 'Budi Santoso', email: 'procurement@nike.co.id', phone: '+62215550101', address: 'Jl. Industri No. 5, Kawasan Industri Pulogadung', city: 'Jakarta', taxId: '01.234.567.8-091.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-002', name: 'PT Adidas Indonesia', type: 'MANUFACTURER', contact: 'Siti Rahmawati', email: 'supply.id@adidas.com', phone: '+62215550102', address: 'Jl. MH Thamrin No. 28', city: 'Jakarta', taxId: '01.345.678.9-092.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-003', name: 'PT Puma Southeast Asia', type: 'DISTRIBUTOR', contact: 'Andi Wijaya', email: 'sea.orders@puma.com', phone: '+62215550103', address: 'Jl. Sudirman Kav. 52-53', city: 'Jakarta', taxId: '01.456.789.0-093.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-004', name: 'PT Under Armour Asia Pacific', type: 'DISTRIBUTOR', contact: 'Maya Putri', email: 'apac.supply@underarmour.com', phone: '+62215550104', address: 'SCBD Lot 14, Jl. Jend. Sudirman', city: 'Jakarta', taxId: '01.567.890.1-094.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-005', name: 'PT New Balance Indonesia', type: 'DISTRIBUTOR', contact: 'Rudi Hartono', email: 'id.supply@newbalance.com', phone: '+62215550105', address: 'Jl. Gajah Mada No. 88', city: 'Jakarta', taxId: '01.678.901.2-095.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-006', name: 'PT Converse Indonesia', type: 'DISTRIBUTOR', contact: 'Linda Kusuma', email: 'id.orders@converse.com', phone: '+62215550106', address: 'Pacific Place Lt. 12, Jl. SCBD', city: 'Jakarta', taxId: '01.789.012.3-096.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-007', name: 'PT Vans Asia Pacific', type: 'DISTRIBUTOR', contact: 'Dewi Lestari', email: 'apac.b2b@vans.com', phone: '+62215550107', address: 'World Trade Centre 3, Jl. H.R. Rasuna Said', city: 'Jakarta', taxId: '01.890.123.4-097.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-008', name: 'PT Skechers Southeast Asia', type: 'WHOLESALER', contact: 'Ratna Sari', email: 'sea.wholesale@skechers.com', phone: '+62215550108', address: 'Senayan City Lt. 5, Jl. Asia Afrika', city: 'Jakarta', taxId: '01.901.234.5-098.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-009', name: 'PT Jordan Brand Indonesia', type: 'DISTRIBUTOR', contact: 'Indah Permatasari', email: 'id.jordan@nike.com', phone: '+62215550109', address: 'Jl. Budi Kemuliaan No. 1, Kebon Jeruk', city: 'Jakarta', taxId: '01.012.345.6-099.000', paymentTerms: 'NET_30', status: 'DRAFT' },
  { code: 'SUP-010', name: 'PT The North Face Indonesia', type: 'WHOLESALER', contact: 'Hendra Gunawan', email: 'id.wholesale@thenorthface.com', phone: '+62215550110', address: 'Menara Anugrah Lt. 10, Jl. Jend. Gatot Subroto', city: 'Jakarta', taxId: '01.135.791.3-100.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-011', name: 'PT Columbia Sportswear SEA', type: 'DISTRIBUTOR', contact: 'Fitri Handayani', email: 'sea.orders@columbia.com', phone: '+62215550111', address: 'Wisma BNI 46 Lt. 18, Jl. Jend. Sudirman', city: 'Jakarta', taxId: '01.246.802.4-101.000', paymentTerms: 'NET_60', status: 'IN_REVIEW' },
  { code: 'SUP-012', name: 'PT Timberland Asia', type: 'DISTRIBUTOR', contact: 'Bambang Pratama', email: 'asia.supply@timberland.com', phone: '+62225550112', address: 'Jl. Cibadak No. 78', city: 'Bandung', taxId: '02.369.147.0-102.000', paymentTerms: 'NET_30', status: 'IN_REVIEW' },
];

// ── Pricing seed data (20 records) ──
const PRICING_SEEDS: PricingSeed[] = [
  { code: 'PRC-001', articleCode: 'ART-001', priceType: 'REGULAR', price: 1899000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-002', articleCode: 'ART-001', priceType: 'COST', price: 1200000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-003', articleCode: 'ART-002', priceType: 'REGULAR', price: 3299000, currency: 'IDR', effectiveDate: '2024-02-01', expiryDate: '2025-01-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-004', articleCode: 'ART-002', priceType: 'WHOLESALE', price: 2950000, currency: 'IDR', effectiveDate: '2024-02-01', expiryDate: '2025-01-31', storeType: 'SUPERMARKET', region: 'WEST_JAVA' },
  { code: 'PRC-005', articleCode: 'ART-006', priceType: 'REGULAR', price: 3899000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2025-02-28', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-006', articleCode: 'ART-010', priceType: 'REGULAR', price: 1299000, currency: 'IDR', effectiveDate: '2024-01-15', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-007', articleCode: 'ART-012', priceType: 'REGULAR', price: 1699000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-008', articleCode: 'ART-012', priceType: 'PROMOTIONAL', price: 1399000, currency: 'IDR', effectiveDate: '2024-07-01', expiryDate: '2024-07-31', storeType: 'SUPERMARKET', region: 'WEST_JAVA' },
  { code: 'PRC-009', articleCode: 'ART-020', priceType: 'REGULAR', price: 2199000, currency: 'IDR', effectiveDate: '2024-04-01', expiryDate: '2025-03-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-010', articleCode: 'ART-023', priceType: 'REGULAR', price: 449000, currency: 'IDR', effectiveDate: '2024-02-15', expiryDate: '2025-02-14', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-011', articleCode: 'ART-031', priceType: 'REGULAR', price: 2199000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2025-02-28', storeType: 'SPECIALTY', region: 'BALI_NT' },
  { code: 'PRC-012', articleCode: 'ART-031', priceType: 'WHOLESALE', price: 1799000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2025-02-28', storeType: 'HYPERMARKET', region: 'EAST_JAVA' },
  { code: 'PRC-013', articleCode: 'ART-043', priceType: 'REGULAR', price: 1299000, currency: 'IDR', effectiveDate: '2024-05-01', expiryDate: '2025-04-30', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-014', articleCode: 'ART-048', priceType: 'REGULAR', price: 2199000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-015', articleCode: 'ART-052', priceType: 'REGULAR', price: 1899000, currency: 'IDR', effectiveDate: '2024-06-01', expiryDate: '2025-05-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-016', articleCode: 'ART-059', priceType: 'REGULAR', price: 8499000, currency: 'IDR', effectiveDate: '2024-04-01', expiryDate: '2025-03-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-017', articleCode: 'ART-003', priceType: 'REGULAR', price: 2799000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-018', articleCode: 'ART-054', priceType: 'REGULAR', price: 1499000, currency: 'IDR', effectiveDate: '2024-08-01', expiryDate: '2025-07-31', storeType: 'HYPERMARKET', region: 'EAST_JAVA' },
  { code: 'PRC-019', articleCode: 'ART-041', priceType: 'COST', price: 480000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-020', articleCode: 'ART-060', priceType: 'REGULAR', price: 2099000, currency: 'IDR', effectiveDate: '2024-09-01', expiryDate: '2025-08-31', storeType: 'SPECIALTY', region: 'BALI_NT' },
];

// ── Promotion seed data (12 MAP-style campaigns) ──
const PROMOTION_SEEDS: PromotionSeed[] = [
  { code: 'PROMO-001', name: 'mapclub Summer Sale 2024', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 25, startDate: '2024-06-01', endDate: '2024-07-31', applicableCategories: 'APPAREL,FOOTWEAR', minPurchase: 500000, maxDiscount: 500000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-002', name: 'Nike Running Week', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-05-01', endDate: '2024-05-07', applicableCategories: 'RUNNING_SHOES', minPurchase: 1000000, maxDiscount: 300000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-003', name: 'Back to School Bundle', promoType: 'BUNDLE', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-07-01', endDate: '2024-07-31', applicableCategories: 'FOOTWEAR,ACCESSORIES', minPurchase: 750000, maxDiscount: 200000, storeType: 'SUPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-004', name: 'Jordan Brand Exclusive', promoType: 'DISCOUNT', discountType: 'FIXED', discountValue: 200000, startDate: '2024-09-01', endDate: '2024-09-30', applicableCategories: 'BASKETBALL_SHOES', minPurchase: 2000000, maxDiscount: 200000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-005', name: 'Year End Clearance', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 30, startDate: '2024-12-01', endDate: '2024-12-31', applicableCategories: 'APPAREL,FOOTWEAR,ACCESSORIES', minPurchase: 0, maxDiscount: 1000000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-006', name: 'Outdoor Adventure Sale', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 20, startDate: '2024-10-01', endDate: '2024-10-31', applicableCategories: 'SPORTS_EQUIPMENT,OUTDOOR', minPurchase: 1000000, maxDiscount: 800000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-007', name: 'mapclub Flash Sale Sneakers', promoType: 'FLASH_SALE', discountType: 'PERCENTAGE', discountValue: 40, startDate: '2024-11-11', endDate: '2024-11-12', applicableCategories: 'CASUAL_SNEAKERS', minPurchase: 0, maxDiscount: 600000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-008', name: 'Adidas Performance Week', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 20, startDate: '2024-08-15', endDate: '2024-08-25', applicableCategories: 'RUNNING_SHOES,TRAINING_SHOES', minPurchase: 800000, maxDiscount: 400000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-009', name: 'Ramadan Special Bundle', promoType: 'BUNDLE', discountType: 'PERCENTAGE', discountValue: 25, startDate: '2024-03-10', endDate: '2024-04-09', applicableCategories: 'APPAREL,ACCESSORIES', minPurchase: 800000, maxDiscount: 500000, storeType: 'HYPERMARKET', status: 'IN_REVIEW' },
  { code: 'PROMO-010', name: 'Under Armour Training Pack', promoType: 'BUNDLE', discountType: 'PERCENTAGE', discountValue: 20, startDate: '2024-04-01', endDate: '2024-04-30', applicableCategories: 'COMPRESSION_WEAR,TRAINING_SHOES', minPurchase: 500000, maxDiscount: 300000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-011', name: 'The North Face Explorer Deal', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-06-01', endDate: '2024-06-30', applicableCategories: 'OUTDOOR', minPurchase: 2000000, maxDiscount: 750000, storeType: 'SPECIALTY', status: 'DRAFT' },
  { code: 'PROMO-012', name: 'mapclub Buy 2 Get 1 Accessories', promoType: 'BOGO', discountType: 'PERCENTAGE', discountValue: 100, startDate: '2024-12-10', endDate: '2024-12-25', applicableCategories: 'SOCKS,HATS', minPurchase: 0, maxDiscount: 200000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
];

// ── Curated Unsplash image URLs per category (stable hotlinks) ─
const SHOE_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=400&h=400&fit=crop',
];
const APPAREL_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578681994506-b8f463449011?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=400&fit=crop',
];
const BAG_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=400&h=400&fit=crop',
];
const ACCESSORY_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1521369909029-2afed882ba98?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1577903611493-6b498a0a4c52?w=400&h=400&fit=crop',
];
const SPORTS_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1461896836934-bd45ba8fcf9b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&h=400&fit=crop',
];
const OUTDOOR_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=400&h=400&fit=crop',
];
const STORE_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=400&h=400&fit=crop',
];

// Map article category code → photo pool
function photoPoolForCategory(category: string): string[] {
  switch (category) {
    case 'FOOTWEAR': return SHOE_PHOTOS;
    case 'APPAREL': return APPAREL_PHOTOS;
    case 'ACCESSORIES': {
      // Distribute across bags/hats/socks/watches/sunglasses/belts photos
      const pool = [...ACCESSORY_PHOTOS, ...BAG_PHOTOS];
      return pool;
    }
    case 'SPORTS_EQUIPMENT': return SPORTS_PHOTOS;
    case 'OUTDOOR': return OUTDOOR_PHOTOS;
    default: return SHOE_PHOTOS;
  }
}

// ============================================================
// MAIN POST HANDLER
// ============================================================
export async function POST(request: NextRequest) {
  try {
    // ── Authorization: require admin:write permission ────────────────
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !hasPermission(tokenPayload.roles, 'admin:write')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: admin:write' },
        { status: 403 }
      );
    }

    const summary: {
      startedAt: string;
      completedAt?: string;
      success?: boolean;
      message?: string;
      steps: string[];
      articlesCreated?: number;
      storesCreated?: number;
      suppliersCreated?: number;
      pricingsCreated?: number;
      promotionsCreated?: number;
      imagesCreated?: number;
      hierarchyNodesCreated?: number;
      lookupsUpdated?: number;
      deletedRecords?: number;
      deletedImages?: number;
    } = {
      startedAt: new Date().toISOString(),
      steps: [],
    };

    // ── Resolve modules by code ──────────────────────────────
    const moduleCodes = [
      'ARTICLE_MASTER',
      'STORE_MASTER',
      'SUPPLIER_MASTER',
      'PRICING_MASTER',
      'PROMOTION_MASTER',
    ];
    const moduleRows = await db.metaModule.findMany({
      where: { moduleCode: { in: moduleCodes } },
      select: { id: true, moduleCode: true },
    });
    const moduleMap: Record<string, string> = {};
    for (const m of moduleRows) {
      moduleMap[m.moduleCode] = m.id;
    }
    for (const code of moduleCodes) {
      if (!moduleMap[code]) {
        return NextResponse.json(
          { error: `Required module "${code}" not found. Run /api/seed first.` },
          { status: 400 }
        );
      }
    }

    // ── Resolve default company (MAPI) and superadmin user ─────
    const companyMAPI = await db.tenantCompany.findUnique({
      where: { companyCode: 'MAPI' },
    });
    if (!companyMAPI) {
      return NextResponse.json(
        { error: 'Default company "MAPI" not found. Run /api/seed first.' },
        { status: 400 }
      );
    }
    const superAdmin = await db.sysUser.findFirst({
      where: {
        username: 'superadmin',
        companyId: companyMAPI.id,
      },
    });
    if (!superAdmin) {
      return NextResponse.json(
        { error: 'Super Admin user not found. Run /api/seed first.' },
        { status: 400 }
      );
    }

    // ============================================================
    // STEP 1: WIPE EXISTING SAMPLE DATA (atomic transaction)
    // ============================================================
    const moduleIds = Object.values(moduleMap);
    const articleModuleId = moduleMap['ARTICLE_MASTER'];

    const deletionStats = await db.$transaction(async (tx) => {
      const delImages = await tx.imageAsset.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      const delTickets = await tx.approvalTicket.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      const delVersions = await tx.dataVersion.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      const delRecords = await tx.dataRecord.deleteMany({
        where: { moduleId: { in: moduleIds } },
      });
      const delFileAssets = await tx.fileAsset.deleteMany({
        where: { category: 'image' },
      });
      const delHierarchyNodes = await tx.hierarchyNode.deleteMany({
        where: { hierarchy: { moduleId: articleModuleId } },
      });
      const delHierarchyModels = await tx.hierarchyModel.deleteMany({
        where: { moduleId: articleModuleId },
      });
      return {
        delImages: delImages.count,
        delTickets: delTickets.count,
        delVersions: delVersions.count,
        delRecords: delRecords.count,
        delFileAssets: delFileAssets.count,
        delHierarchyNodes: delHierarchyNodes.count,
        delHierarchyModels: delHierarchyModels.count,
      };
    });

    summary.steps.push(
      `Step 1 Wipe: images=${deletionStats.delImages}, tickets=${deletionStats.delTickets}, ` +
      `versions=${deletionStats.delVersions}, records=${deletionStats.delRecords}, ` +
      `fileAssets=${deletionStats.delFileAssets}, hierarchyNodes=${deletionStats.delHierarchyNodes}, ` +
      `hierarchyModels=${deletionStats.delHierarchyModels}`
    );

    // ============================================================
    // STEP 2: REFRESH LOOKUPS WITH MAPCLUB-INSPIRED TAXONOMY
    // ============================================================
    let lookupsUpdated = 0;

    // ── 2a. CATEGORY lookup (5 mapclub.com categories) ───
    const categoryLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'CATEGORY' },
      include: { values: true },
    });
    if (!categoryLookup) {
      return NextResponse.json(
        { error: 'CATEGORY lookup not found. Run /api/seed first.' },
        { status: 400 }
      );
    }
    const newCategoryValues = [
      { valueCode: 'FOOTWEAR', displayValue: 'Footwear', sortOrder: 0 },
      { valueCode: 'APPAREL', displayValue: 'Apparel', sortOrder: 1 },
      { valueCode: 'ACCESSORIES', displayValue: 'Accessories', sortOrder: 2 },
      { valueCode: 'SPORTS_EQUIPMENT', displayValue: 'Sports Equipment', sortOrder: 3 },
      { valueCode: 'OUTDOOR', displayValue: 'Outdoor', sortOrder: 4 },
    ];
    for (const v of newCategoryValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: categoryLookup.id, valueCode: v.valueCode } },
        create: { lookupId: categoryLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
      });
    }
    // Deactivate any old category values not in the new list
    const newCatCodes = newCategoryValues.map((v) => v.valueCode);
    const oldCatDeactivated = await db.lookupValue.updateMany({
      where: { lookupId: categoryLookup.id, valueCode: { notIn: newCatCodes } },
      data: { isActive: false },
    });
    lookupsUpdated += newCategoryValues.length;
    summary.steps.push(
      `Step 2a CATEGORY: upserted ${newCategoryValues.length} mapclub.com category values, ` +
      `deactivated ${oldCatDeactivated.count} stale values`
    );

    // ── 2b. SUB_CATEGORY lookup (29 cascading child values) ────
    let subCategoryLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'SUB_CATEGORY' },
    });
    if (!subCategoryLookup) {
      subCategoryLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'SUB_CATEGORY',
          lookupName: 'Article Sub Category',
          description: 'Sub-category with cascading relation to Category (parentValueCode)',
        },
      });
    }
    const subCategoryValues: Array<{ valueCode: string; displayValue: string; parentValueCode: string; sortOrder: number }> = [
      // FOOTWEAR (6)
      { valueCode: 'RUNNING_SHOES', displayValue: 'Running Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 0 },
      { valueCode: 'BASKETBALL_SHOES', displayValue: 'Basketball Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 1 },
      { valueCode: 'CASUAL_SNEAKERS', displayValue: 'Casual Sneakers', parentValueCode: 'FOOTWEAR', sortOrder: 2 },
      { valueCode: 'SANDALS', displayValue: 'Sandals', parentValueCode: 'FOOTWEAR', sortOrder: 3 },
      { valueCode: 'FORMAL_SHOES', displayValue: 'Formal Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 4 },
      { valueCode: 'TRAINING_SHOES', displayValue: 'Training Shoes', parentValueCode: 'FOOTWEAR', sortOrder: 5 },
      // APPAREL (6)
      { valueCode: 'T_SHIRTS', displayValue: 'T-Shirts', parentValueCode: 'APPAREL', sortOrder: 6 },
      { valueCode: 'HOODIES', displayValue: 'Hoodies', parentValueCode: 'APPAREL', sortOrder: 7 },
      { valueCode: 'JACKETS', displayValue: 'Jackets', parentValueCode: 'APPAREL', sortOrder: 8 },
      { valueCode: 'PANTS', displayValue: 'Pants', parentValueCode: 'APPAREL', sortOrder: 9 },
      { valueCode: 'SHORTS', displayValue: 'Shorts', parentValueCode: 'APPAREL', sortOrder: 10 },
      { valueCode: 'COMPRESSION_WEAR', displayValue: 'Compression Wear', parentValueCode: 'APPAREL', sortOrder: 11 },
      // ACCESSORIES (6)
      { valueCode: 'BAGS', displayValue: 'Bags', parentValueCode: 'ACCESSORIES', sortOrder: 12 },
      { valueCode: 'HATS', displayValue: 'Hats', parentValueCode: 'ACCESSORIES', sortOrder: 13 },
      { valueCode: 'SOCKS', displayValue: 'Socks', parentValueCode: 'ACCESSORIES', sortOrder: 14 },
      { valueCode: 'WATCHES', displayValue: 'Watches', parentValueCode: 'ACCESSORIES', sortOrder: 15 },
      { valueCode: 'SUNGLASSES', displayValue: 'Sunglasses', parentValueCode: 'ACCESSORIES', sortOrder: 16 },
      { valueCode: 'BELTS', displayValue: 'Belts', parentValueCode: 'ACCESSORIES', sortOrder: 17 },
      // SPORTS_EQUIPMENT (6)
      { valueCode: 'BASKETBALL', displayValue: 'Basketball', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 18 },
      { valueCode: 'FOOTBALL', displayValue: 'Football', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 19 },
      { valueCode: 'TENNIS', displayValue: 'Tennis', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 20 },
      { valueCode: 'SWIMMING', displayValue: 'Swimming', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 21 },
      { valueCode: 'YOGA', displayValue: 'Yoga', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 22 },
      { valueCode: 'GYM_EQUIPMENT', displayValue: 'Gym Equipment', parentValueCode: 'SPORTS_EQUIPMENT', sortOrder: 23 },
      // OUTDOOR (4)
      { valueCode: 'CAMPING', displayValue: 'Camping', parentValueCode: 'OUTDOOR', sortOrder: 24 },
      { valueCode: 'HIKING', displayValue: 'Hiking', parentValueCode: 'OUTDOOR', sortOrder: 25 },
      { valueCode: 'CYCLING', displayValue: 'Cycling', parentValueCode: 'OUTDOOR', sortOrder: 26 },
      { valueCode: 'RUNNING_GEAR', displayValue: 'Running Gear', parentValueCode: 'OUTDOOR', sortOrder: 27 },
    ];
    for (const v of subCategoryValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: subCategoryLookup.id, valueCode: v.valueCode } },
        create: { lookupId: subCategoryLookup.id, ...v, isActive: true },
        update: {
          displayValue: v.displayValue,
          parentValueCode: v.parentValueCode,
          sortOrder: v.sortOrder,
          isActive: true,
        },
      });
    }
    // Resolve parentValueId from parentValueCode (cross-lookup to CATEGORY)
    const catVals = await db.lookupValue.findMany({
      where: { lookupId: categoryLookup.id, isActive: true },
      select: { id: true, valueCode: true },
    });
    const catCodeToId = new Map(catVals.map((v) => [v.valueCode, v.id]));
    const allSubs = await db.lookupValue.findMany({
      where: { lookupId: subCategoryLookup.id, isActive: true },
      select: { id: true, valueCode: true, parentValueCode: true, parentValueId: true },
    });
    for (const v of allSubs) {
      if (v.parentValueCode) {
        const expectedParentId = catCodeToId.get(v.parentValueCode) ?? null;
        if (v.parentValueId !== expectedParentId) {
          await db.lookupValue.update({
            where: { id: v.id },
            data: { parentValueId: expectedParentId },
          });
        }
      }
    }
    // Deactivate stale sub_category values
    const newSubCodes = subCategoryValues.map((v) => v.valueCode);
    const oldSubDeactivated = await db.lookupValue.updateMany({
      where: { lookupId: subCategoryLookup.id, valueCode: { notIn: newSubCodes } },
      data: { isActive: false },
    });
    lookupsUpdated += subCategoryValues.length;
    summary.steps.push(
      `Step 2b SUB_CATEGORY: upserted ${subCategoryValues.length} cascading child values + resolved parentValueId, ` +
      `deactivated ${oldSubDeactivated.count} stale values`
    );

    // ── 2c. ARTICLE_TAGS lookup (keep existing tags) ─────────
    let tagsLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'ARTICLE_TAGS' },
    });
    if (!tagsLookup) {
      tagsLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'ARTICLE_TAGS',
          lookupName: 'Article Tags',
          description: 'Multi-select tag list for articles',
        },
      });
    }
    const tagValues = [
      { valueCode: 'NEW_ARRIVAL', displayValue: 'New Arrival', sortOrder: 0 },
      { valueCode: 'BEST_SELLER', displayValue: 'Best Seller', sortOrder: 1 },
      { valueCode: 'SALE', displayValue: 'Sale', sortOrder: 2 },
      { valueCode: 'FEATURED', displayValue: 'Featured', sortOrder: 3 },
      { valueCode: 'LIMITED', displayValue: 'Limited Edition', sortOrder: 4 },
      { valueCode: 'EXCLUSIVE', displayValue: 'Exclusive', sortOrder: 5 },
      { valueCode: 'PREMIUM', displayValue: 'Premium', sortOrder: 6 },
    ];
    for (const v of tagValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: tagsLookup.id, valueCode: v.valueCode } },
        create: { lookupId: tagsLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
      });
    }
    lookupsUpdated += tagValues.length;
    summary.steps.push(`Step 2c ARTICLE_TAGS: ensured ${tagValues.length} tag values exist`);

    // ── 2d. BRAND lookup (16 MAP-carried brands) ─────────
    let brandLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'BRAND' },
    });
    if (!brandLookup) {
      brandLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'BRAND',
          lookupName: 'Article Brand',
          description: 'MAP Active brand catalog (Nike, Adidas, Puma, etc.)',
        },
      });
    }
    const brandValues = [
      { valueCode: 'NIKE', displayValue: 'Nike', sortOrder: 0 },
      { valueCode: 'ADIDAS', displayValue: 'Adidas', sortOrder: 1 },
      { valueCode: 'PUMA', displayValue: 'Puma', sortOrder: 2 },
      { valueCode: 'UNDER_ARMOUR', displayValue: 'Under Armour', sortOrder: 3 },
      { valueCode: 'NEW_BALANCE', displayValue: 'New Balance', sortOrder: 4 },
      { valueCode: 'REEBOK', displayValue: 'Reebok', sortOrder: 5 },
      { valueCode: 'ASICS', displayValue: 'Asics', sortOrder: 6 },
      { valueCode: 'CONVERSE', displayValue: 'Converse', sortOrder: 7 },
      { valueCode: 'VANS', displayValue: 'Vans', sortOrder: 8 },
      { valueCode: 'FILA', displayValue: 'Fila', sortOrder: 9 },
      { valueCode: 'SKECHERS', displayValue: 'Skechers', sortOrder: 10 },
      { valueCode: 'JORDAN', displayValue: 'Jordan', sortOrder: 11 },
      { valueCode: 'THE_NORTH_FACE', displayValue: 'The North Face', sortOrder: 12 },
      { valueCode: 'COLUMBIA', displayValue: 'Columbia', sortOrder: 13 },
      { valueCode: 'TIMBERLAND', displayValue: 'Timberland', sortOrder: 14 },
      { valueCode: 'CASIO', displayValue: 'Casio', sortOrder: 15 },
    ];
    for (const v of brandValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: brandLookup.id, valueCode: v.valueCode } },
        create: { lookupId: brandLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
      });
    }
    // Deactivate stale brand values
    const newBrandCodes = brandValues.map((v) => v.valueCode);
    const oldBrandDeactivated = await db.lookupValue.updateMany({
      where: { lookupId: brandLookup.id, valueCode: { notIn: newBrandCodes } },
      data: { isActive: false },
    });
    lookupsUpdated += brandValues.length;
    summary.steps.push(
      `Step 2d BRAND: upserted ${brandValues.length} MAP-carried brand values, ` +
      `deactivated ${oldBrandDeactivated.count} stale values`
    );

    // ============================================================
    // STEP 3: RECREATE ARTICLE HIERARCHY (3-level MAP structure)
    // ============================================================
    const hierarchy = await db.hierarchyModel.create({
      data: {
        moduleId: articleModuleId,
        hierarchyName: 'MAP Article Hierarchy',
        description: '3-level hierarchy: Men/Women/Kids/Unisex → Footwear/Apparel/... → Running/Sneakers/...',
      },
    });

    // Level 0 — roots (Gender / target segments)
    const nodeMen = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Men', materializedPath: '', depthLevel: 0, sortOrder: 0, status: 'ACTIVE' },
    });
    const nodeWomen = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Women', materializedPath: '', depthLevel: 0, sortOrder: 1, status: 'ACTIVE' },
    });
    const nodeKids = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Kids', materializedPath: '', depthLevel: 0, sortOrder: 2, status: 'ACTIVE' },
    });
    const nodeUnisex = await db.hierarchyNode.create({
      data: { hierarchyId: hierarchy.id, nodeLabel: 'Unisex', materializedPath: '', depthLevel: 0, sortOrder: 3, status: 'ACTIVE' },
    });

    // Level 1 — product category groups under each root
    const l1Men = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeMen.id, nodeLabel: 'Footwear', materializedPath: nodeMen.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeMen.id, nodeLabel: 'Apparel', materializedPath: nodeMen.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeMen.id, nodeLabel: 'Accessories', materializedPath: nodeMen.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeMen.id, nodeLabel: 'Sports Equipment', materializedPath: nodeMen.id, depthLevel: 1, sortOrder: 3, status: 'ACTIVE' } }),
    ]);
    const l1Women = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWomen.id, nodeLabel: 'Footwear', materializedPath: nodeWomen.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWomen.id, nodeLabel: 'Apparel', materializedPath: nodeWomen.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWomen.id, nodeLabel: 'Accessories', materializedPath: nodeWomen.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWomen.id, nodeLabel: 'Sports Equipment', materializedPath: nodeWomen.id, depthLevel: 1, sortOrder: 3, status: 'ACTIVE' } }),
    ]);
    const l1Kids = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeKids.id, nodeLabel: 'Footwear', materializedPath: nodeKids.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeKids.id, nodeLabel: 'Apparel', materializedPath: nodeKids.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeKids.id, nodeLabel: 'Accessories', materializedPath: nodeKids.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
    ]);
    const l1Unisex = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Footwear', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Apparel', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Outdoor', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Sports Equipment', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 3, status: 'ACTIVE' } }),
    ]);

    // Level 2 — sub-category nodes
    const l2FootwearLabels = ['Running Shoes', 'Basketball Shoes', 'Casual Sneakers', 'Sandals', 'Formal Shoes', 'Training Shoes'];
    const l2ApparelLabels = ['T-Shirts', 'Hoodies', 'Jackets', 'Pants', 'Shorts', 'Compression Wear'];
    const l2AccessoriesLabels = ['Bags', 'Hats', 'Socks', 'Watches', 'Sunglasses', 'Belts'];
    const l2SportsLabels = ['Basketball', 'Football', 'Tennis', 'Swimming', 'Yoga', 'Gym Equipment'];
    const l2OutdoorLabels = ['Camping', 'Hiking', 'Cycling', 'Running Gear'];

    const createL2Batch = async (parent: { id: string }, labels: string[], startSort: number) => {
      await Promise.all(
        labels.map((label, i) =>
          db.hierarchyNode.create({
            data: {
              hierarchyId: hierarchy.id,
              parentNodeId: parent.id,
              nodeLabel: label,
              materializedPath: parent.id,
              depthLevel: 2,
              sortOrder: startSort + i,
              status: 'ACTIVE',
            },
          })
        )
      );
    };

    // Footwear sub-categories under each gender segment
    const footwearNodes = [l1Men[0], l1Women[0], l1Kids[0], l1Unisex[0]];
    for (const n of footwearNodes) {
      await createL2Batch(n, l2FootwearLabels, 0);
    }
    // Apparel sub-categories
    const apparelNodes = [l1Men[1], l1Women[1], l1Kids[1], l1Unisex[1]];
    for (const n of apparelNodes) {
      await createL2Batch(n, l2ApparelLabels, 0);
    }
    // Accessories sub-categories
    const accessoriesNodes = [l1Men[2], l1Women[2], l1Kids[2]];
    for (const n of accessoriesNodes) {
      await createL2Batch(n, l2AccessoriesLabels, 0);
    }
    // Sports Equipment sub-categories
    const sportsNodes = [l1Men[3], l1Women[3], l1Unisex[3]];
    for (const n of sportsNodes) {
      await createL2Batch(n, l2SportsLabels, 0);
    }
    // Outdoor sub-categories (only under Unisex)
    await createL2Batch(l1Unisex[2], l2OutdoorLabels, 0);

    // Count: 4 roots + 15 L1 + (4*6 Footwear + 4*6 Apparel + 3*6 Accessories + 3*6 Sports + 1*4 Outdoor) L2
    const hierarchyNodesCount = 4 + 15 + (4 * 6) + (4 * 6) + (3 * 6) + (3 * 6) + (1 * 4);
    summary.steps.push(
      `Step 3 Hierarchy: created "MAP Article Hierarchy" with 4 roots (Men/Women/Kids/Unisex) + 15 level-1 nodes + ${hierarchyNodesCount - 19} level-2 nodes = ${hierarchyNodesCount} total nodes`
    );

    // ============================================================
    // STEP 4: CREATE SAMPLE DATA RECORDS
    // ============================================================
    let articlesCreated = 0;
    let storesCreated = 0;
    let suppliersCreated = 0;
    let pricingsCreated = 0;
    let promotionsCreated = 0;

    const articleRecordByCode: Record<string, { id: string }> = {};
    const storeRecordByCode: Record<string, { id: string }> = {};

    async function parallelChunked<T, R>(
      items: T[],
      fn: (item: T, index: number) => Promise<R>,
      chunkSize = 8
    ): Promise<R[]> {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map((item, j) => fn(item, i + j))
        );
        results.push(...chunkResults);
      }
      return results;
    }

    // ── 4a. ARTICLE_MASTER records (55) ────────────────────────
    interface ArticleRow {
      seed: typeof ARTICLE_SEEDS[0];
      payloadStr: string;
      recordId: string;
    }
    const articleRows: ArticleRow[] = [];
    await parallelChunked(ARTICLE_SEEDS, async (seed) => {
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
      };
      const payloadStr = JSON.stringify(payload);
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['ARTICLE_MASTER'],
          companyId: companyMAPI.id,
          status: seed.status,
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      articleRecordByCode[seed.code] = { id: record.id };
      articleRows.push({ seed, payloadStr, recordId: record.id });
      articlesCreated++;
    });

    // Bulk-insert DataVersions for ACTIVE + REVISION_PENDING articles
    const articleVersionData = articleRows
      .filter((r) => r.seed.status === 'ACTIVE' || r.seed.status === 'REVISION_PENDING')
      .map((r) => ({
        recordId: r.recordId,
        payloadSnapshot: r.payloadStr,
        versionNumber: 1,
        changedById: superAdmin.id,
        changeReason: 'Initial creation (auto-approved)',
        status: 'ACTIVE' as const,
      }));
    if (articleVersionData.length > 0) {
      await db.dataVersion.createMany({ data: articleVersionData });
    }

    // Bulk-insert ApprovalTickets for IN_REVIEW + REVISION_PENDING articles
    const articleTicketData = articleRows
      .filter((r) => r.seed.status === 'IN_REVIEW' || r.seed.status === 'REVISION_PENDING')
      .map((r) => ({
        recordId: r.recordId,
        requestedById: superAdmin.id,
        status: 'PENDING' as const,
        deltaPayload: r.payloadStr,
      }));
    if (articleTicketData.length > 0) {
      await db.approvalTicket.createMany({ data: articleTicketData });
    }
    const activeArticles = ARTICLE_SEEDS.filter(a => a.status === 'ACTIVE').length;
    const draftArticles = ARTICLE_SEEDS.filter(a => a.status === 'DRAFT').length;
    const reviewArticles = ARTICLE_SEEDS.filter(a => a.status === 'IN_REVIEW').length;
    const revisionArticles = ARTICLE_SEEDS.filter(a => a.status === 'REVISION_PENDING').length;
    summary.steps.push(
      `Step 4a ARTICLE_MASTER: created ${articlesCreated} records ` +
      `(${activeArticles} ACTIVE + ${draftArticles} DRAFT + ${reviewArticles} IN_REVIEW + ${revisionArticles} REVISION_PENDING)`
    );

    // ── 4b. STORE_MASTER records (20) ──────────────
    interface StoreRow {
      seed: typeof STORE_SEEDS[0];
      payloadStr: string;
      recordId: string;
    }
    const storeRows: StoreRow[] = [];
    await parallelChunked(STORE_SEEDS, async (seed) => {
      const payload = {
        store_code: seed.code,
        store_name: seed.name,
        region: seed.region,
        city: seed.city,
        address: seed.address,
        phone: seed.phone,
        store_type: seed.storeType,
        opening_date: seed.openingDate,
        is_active: true,
      };
      const payloadStr = JSON.stringify(payload);
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['STORE_MASTER'],
          companyId: companyMAPI.id,
          status: seed.status,
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      storeRecordByCode[seed.code] = { id: record.id };
      storeRows.push({ seed, payloadStr, recordId: record.id });
      storesCreated++;
    });
    // DataVersions for ACTIVE stores
    const storeVersionData = storeRows
      .filter((r) => r.seed.status === 'ACTIVE')
      .map((r) => ({
        recordId: r.recordId,
        payloadSnapshot: r.payloadStr,
        versionNumber: 1,
        changedById: superAdmin.id,
        changeReason: 'Initial creation (auto-approved)',
        status: 'ACTIVE' as const,
      }));
    if (storeVersionData.length > 0) {
      await db.dataVersion.createMany({ data: storeVersionData });
    }
    // ApprovalTickets for IN_REVIEW stores
    const storeTicketData = storeRows
      .filter((r) => r.seed.status === 'IN_REVIEW')
      .map((r) => ({
        recordId: r.recordId,
        requestedById: superAdmin.id,
        status: 'PENDING' as const,
        deltaPayload: r.payloadStr,
      }));
    if (storeTicketData.length > 0) {
      await db.approvalTicket.createMany({ data: storeTicketData });
    }
    const activeStores = STORE_SEEDS.filter(s => s.status === 'ACTIVE').length;
    const draftStores = STORE_SEEDS.filter(s => s.status === 'DRAFT').length;
    const reviewStores = STORE_SEEDS.filter(s => s.status === 'IN_REVIEW').length;
    summary.steps.push(
      `Step 4b STORE_MASTER: created ${storesCreated} records ` +
      `(${activeStores} ACTIVE + ${draftStores} DRAFT + ${reviewStores} IN_REVIEW)`
    );

    // ── 4c. SUPPLIER_MASTER records (12) ──
    interface SupplierRow {
      seed: typeof SUPPLIER_SEEDS[0];
      payloadStr: string;
      recordId: string;
    }
    const supplierRows: SupplierRow[] = [];
    await parallelChunked(SUPPLIER_SEEDS, async (seed) => {
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
      const payloadStr = JSON.stringify(payload);
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['SUPPLIER_MASTER'],
          companyId: companyMAPI.id,
          status: seed.status,
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      supplierRows.push({ seed, payloadStr, recordId: record.id });
      suppliersCreated++;
    });
    const supplierVersionData = supplierRows
      .filter((r) => r.seed.status === 'ACTIVE')
      .map((r) => ({
        recordId: r.recordId,
        payloadSnapshot: r.payloadStr,
        versionNumber: 1,
        changedById: superAdmin.id,
        changeReason: 'Initial creation (auto-approved)',
        status: 'ACTIVE' as const,
      }));
    if (supplierVersionData.length > 0) {
      await db.dataVersion.createMany({ data: supplierVersionData });
    }
    const supplierTicketData = supplierRows
      .filter((r) => r.seed.status === 'IN_REVIEW')
      .map((r) => ({
        recordId: r.recordId,
        requestedById: superAdmin.id,
        status: 'PENDING' as const,
        deltaPayload: r.payloadStr,
      }));
    if (supplierTicketData.length > 0) {
      await db.approvalTicket.createMany({ data: supplierTicketData });
    }
    const activeSuppliers = SUPPLIER_SEEDS.filter(s => s.status === 'ACTIVE').length;
    const draftSuppliers = SUPPLIER_SEEDS.filter(s => s.status === 'DRAFT').length;
    const reviewSuppliers = SUPPLIER_SEEDS.filter(s => s.status === 'IN_REVIEW').length;
    summary.steps.push(
      `Step 4c SUPPLIER_MASTER: created ${suppliersCreated} records ` +
      `(${activeSuppliers} ACTIVE + ${draftSuppliers} DRAFT + ${reviewSuppliers} IN_REVIEW)`
    );

    // ── 4d. PRICING_MASTER records (20, all ACTIVE) ────────────
    interface PricingRow {
      payloadStr: string;
      recordId: string;
    }
    const pricingRows: PricingRow[] = [];
    await parallelChunked(PRICING_SEEDS, async (seed) => {
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
        is_active: true,
      };
      const payloadStr = JSON.stringify(payload);
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['PRICING_MASTER'],
          companyId: companyMAPI.id,
          status: 'ACTIVE',
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      pricingRows.push({ payloadStr, recordId: record.id });
      pricingsCreated++;
    });
    if (pricingRows.length > 0) {
      await db.dataVersion.createMany({
        data: pricingRows.map((r) => ({
          recordId: r.recordId,
          payloadSnapshot: r.payloadStr,
          versionNumber: 1,
          changedById: superAdmin.id,
          changeReason: 'Initial creation (auto-approved)',
          status: 'ACTIVE' as const,
        })),
      });
    }
    summary.steps.push(`Step 4d PRICING_MASTER: created ${pricingsCreated} ACTIVE records with version snapshots`);

    // ── 4e. PROMOTION_MASTER records (12) ──
    interface PromoRow {
      seed: typeof PROMOTION_SEEDS[0];
      payloadStr: string;
      recordId: string;
    }
    const promoRows: PromoRow[] = [];
    await parallelChunked(PROMOTION_SEEDS, async (seed) => {
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
        is_active: true,
      };
      const payloadStr = JSON.stringify(payload);
      const record = await db.dataRecord.create({
        data: {
          moduleId: moduleMap['PROMOTION_MASTER'],
          companyId: companyMAPI.id,
          status: seed.status,
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      promoRows.push({ seed, payloadStr, recordId: record.id });
      promotionsCreated++;
    });
    const promoVersionData = promoRows
      .filter((r) => r.seed.status === 'ACTIVE')
      .map((r) => ({
        recordId: r.recordId,
        payloadSnapshot: r.payloadStr,
        versionNumber: 1,
        changedById: superAdmin.id,
        changeReason: 'Initial creation (auto-approved)',
        status: 'ACTIVE' as const,
      }));
    if (promoVersionData.length > 0) {
      await db.dataVersion.createMany({ data: promoVersionData });
    }
    const promoTicketData = promoRows
      .filter((r) => r.seed.status === 'IN_REVIEW')
      .map((r) => ({
        recordId: r.recordId,
        requestedById: superAdmin.id,
        status: 'PENDING' as const,
        deltaPayload: r.payloadStr,
      }));
    if (promoTicketData.length > 0) {
      await db.approvalTicket.createMany({ data: promoTicketData });
    }
    const activePromos = PROMOTION_SEEDS.filter(p => p.status === 'ACTIVE').length;
    const draftPromos = PROMOTION_SEEDS.filter(p => p.status === 'DRAFT').length;
    const reviewPromos = PROMOTION_SEEDS.filter(p => p.status === 'IN_REVIEW').length;
    summary.steps.push(
      `Step 4e PROMOTION_MASTER: created ${promotionsCreated} records ` +
      `(${activePromos} ACTIVE + ${draftPromos} DRAFT + ${reviewPromos} IN_REVIEW)`
    );

    // ============================================================
    // STEP 5: CREATE IMAGEASSET RECORDS
    // ============================================================
    let imagesCreated = 0;
    const categoryPhotoIndex: Record<string, number> = {};
    let storePhotoIndex = 0;

    const imageAssetsData: Array<{
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
      const rec = articleRecordByCode[seed.code];
      if (!rec) continue;
      const pool = photoPoolForCategory(seed.category);
      const idx = categoryPhotoIndex[seed.category] ?? 0;
      const url = pool[idx % pool.length];
      categoryPhotoIndex[seed.category] = idx + 1;
      imageAssetsData.push({
        recordId: rec.id,
        fieldName: 'images',
        fileName: `${seed.code}.jpg`,
        filePath: url,
        fileSize: 0,
        mimeType: 'image/jpeg',
        altText: seed.name,
        sortOrder: 0,
        isPrimary: true,
      });
      imagesCreated++;
    }

    for (const seed of STORE_SEEDS) {
      const rec = storeRecordByCode[seed.code];
      if (!rec) continue;
      const url = STORE_PHOTOS[storePhotoIndex % STORE_PHOTOS.length];
      storePhotoIndex++;
      imageAssetsData.push({
        recordId: rec.id,
        fieldName: 'store_photos',
        fileName: `${seed.code}.jpg`,
        filePath: url,
        fileSize: 0,
        mimeType: 'image/jpeg',
        altText: seed.name,
        sortOrder: 0,
        isPrimary: true,
      });
      imagesCreated++;
    }

    if (imageAssetsData.length > 0) {
      await db.imageAsset.createMany({ data: imageAssetsData });
    }
    summary.steps.push(
      `Step 5 ImageAsset: created ${imagesCreated} primary images ` +
      `(${ARTICLE_SEEDS.length} articles + ${STORE_SEEDS.length} stores) using stable Unsplash URLs`
    );

    // ============================================================
    // STEP 6: RETURN SUMMARY + LOG AUDIT ENTRY
    // ============================================================
    summary.completedAt = new Date().toISOString();
    summary.success = true;
    summary.message = `Reseeded MAP Active data: ${articlesCreated} articles, ${storesCreated} stores, ${suppliersCreated} suppliers, ${pricingsCreated} pricings, ${promotionsCreated} promotions, ${imagesCreated} images, ${hierarchyNodesCount} hierarchy nodes, ${lookupsUpdated} lookup values upserted.`;
    summary.articlesCreated = articlesCreated;
    summary.storesCreated = storesCreated;
    summary.suppliersCreated = suppliersCreated;
    summary.pricingsCreated = pricingsCreated;
    summary.promotionsCreated = promotionsCreated;
    summary.imagesCreated = imagesCreated;
    summary.hierarchyNodesCreated = hierarchyNodesCount;
    summary.lookupsUpdated = lookupsUpdated;
    summary.deletedRecords = deletionStats.delRecords;
    summary.deletedImages = deletionStats.delImages + deletionStats.delFileAssets;

    await logAudit({
      userId: tokenPayload.userId,
      action: 'RESEED_MAP_DATA',
      entityType: 'DataRecord',
      entityId: '',
      moduleName: 'Migration',
      description: `MAP Active reseed: ${articlesCreated} articles, ${storesCreated} stores, ${suppliersCreated} suppliers, ${pricingsCreated} pricings, ${promotionsCreated} promotions, ${imagesCreated} images`,
      newValues: summary,
      companyId: tokenPayload.companyId,
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error('Reseed MAP data error:', error);
    return NextResponse.json(
      {
        error: 'Reseed failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
