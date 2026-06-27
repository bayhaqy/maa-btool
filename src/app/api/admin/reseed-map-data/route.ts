import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
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
// What this endpoint does (idempotent — safe to re-run):
//   Step 1. Wipe existing sample data for the 5 retail modules
//           (images, approval tickets, versions, records, orphaned
//           image FileAssets, and the Article Hierarchy model+nodes).
//   Step 2. Refresh lookups with mapclub-inspired taxonomy:
//           - CATEGORY: 8 Indonesian retail categories
//           - SUB_CATEGORY: 35 cascading child values
//           - ARTICLE_TAGS: keep existing 7 tags
//           - BRAND: new lookup with 20 MAP-carried brands
//   Step 3. Recreate Article Hierarchy with a 3-level
//           Pria/Wanita/Anak/Unisex → Sepatu/Pakaian/... → Running/...
//           tree (MAP Article Hierarchy).
//   Step 4. Create 50 Article + 12 Store + 12 Supplier +
//           15 Pricing + 8 Promotion records with realistic
//           Indonesian retail data, distributed across statuses
//           (ACTIVE / DRAFT / IN_REVIEW / REVISION_PENDING).
//   Step 5. Create ImageAsset records for every article & store
//           using stable Unsplash URLs (so images appear
//           immediately in the grid editor + record detail page).
//   Step 6. Return a summary JSON and log an audit entry.
//
// Auth: Super Admin only (same pattern as migrate-cascading).
// DB:   Works on both SQLite (local) and PostgreSQL (production).
//       No DB-specific syntax is used.
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

// ── Inline article seed data (50 records, MAP Active catalog) ──
// Statuses distributed: 35 ACTIVE (ART-001..035) + 8 DRAFT (036..043) +
// 5 IN_REVIEW (044..048) + 2 REVISION_PENDING (049..050) = 50.
// Categories span all 8: SEPATU, TAS, PAKAIAN, AKSESORIS, KOSMETIK,
// MAKANAN, ELEKTRONIK, OLAHRAGA.
const ARTICLE_SEEDS: ArticleSeed[] = [
  // SEPATU (12) — all ACTIVE
  { code: 'ART-001', name: 'Nike Air Zoom Pegasus 40', category: 'SEPATU', subCategory: 'SEPATU_RUNNING', brand: 'Nike', purchasePrice: 1200000, sellingPrice: 1899000, tags: 'NEW_ARRIVAL,BEST_SELLER', description: 'Nike Air Zoom Pegasus 40 — sepatu lari ringan dengan respons cushioning terbaik untuk harian maupun marathon.', status: 'ACTIVE' },
  { code: 'ART-002', name: 'Adidas Ultraboost Light', category: 'SEPATU', subCategory: 'SEPATU_RUNNING', brand: 'Adidas', purchasePrice: 2200000, sellingPrice: 3299000, tags: 'NEW_ARRIVAL,PREMIUM', description: 'Adidas Ultraboost Light dengan teknologi BOOST midsole paling ringan sepanjang masa.', status: 'ACTIVE' },
  { code: 'ART-003', name: 'Converse Chuck 70 High', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Converse', purchasePrice: 850000, sellingPrice: 1299000, tags: 'BEST_SELLER', description: 'Converse Chuck 70 High-top klasik dengan kanvas premium dan insole OrthoLite.', status: 'ACTIVE' },
  { code: 'ART-004', name: 'Skechers D\'Lites 3', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Skechers', purchasePrice: 750000, sellingPrice: 1199000, tags: 'BEST_SELLER,SALE', description: 'Sneakers Skechers D\'Lites 3 dengan Air Cooled Goga Mat insole untuk kenyamanan seharian.', status: 'ACTIVE' },
  { code: 'ART-005', name: 'Nike Air Force 1 \'07', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Nike', purchasePrice: 1100000, sellingPrice: 1699000, tags: 'BEST_SELLER,FEATURED', description: 'Nike Air Force 1 \'07 putih klasik, ikon streetwear sejak 1982.', status: 'ACTIVE' },
  { code: 'ART-006', name: 'Adidas Samba OG', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Adidas', purchasePrice: 980000, sellingPrice: 1599000, tags: 'EXCLUSIVE', description: 'Adidas Samba OG edisi original, kulit suede premium dengan sol gum klasik.', status: 'ACTIVE' },
  { code: 'ART-007', name: 'New Balance 530', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'New Balance', purchasePrice: 920000, sellingPrice: 1499000, tags: 'BEST_SELLER', description: 'New Balance 530 dengan ABZORB cushioning dan upper mesh-suede premium.', status: 'ACTIVE' },
  { code: 'ART-008', name: 'Vans Old Skool', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Vans', purchasePrice: 720000, sellingPrice: 1099000, tags: 'BEST_SELLER', description: 'Vans Old Skool dengan side stripe ikonik, klasik skateboard sejak 1977.', status: 'ACTIVE' },
  { code: 'ART-009', name: 'Dr. Martens 1460 Boot', category: 'SEPATU', subCategory: 'SEPATU_BOOT', brand: 'Dr. Martens', purchasePrice: 1850000, sellingPrice: 2899000, tags: 'PREMIUM,EXCLUSIVE', description: 'Dr. Martens 1460 8-eye boot klasik, kulit premium Made In England.', status: 'ACTIVE' },
  { code: 'ART-010', name: 'Nike Air Max 90', category: 'SEPATU', subCategory: 'SEPATU_SNEAKERS', brand: 'Nike', purchasePrice: 1350000, sellingPrice: 2099000, tags: 'FEATURED', description: 'Nike Air Max 90 dengan unit Air yang visible, ikon gaya 90-an.', status: 'ACTIVE' },
  { code: 'ART-011', name: 'Adidas Adiform Command School', category: 'SEPATU', subCategory: 'SEPATU_SEKOLAH', brand: 'Adidas', purchasePrice: 450000, sellingPrice: 799000, tags: 'FEATURED', description: 'Sepatu sekolah Adidas hitam putih, material kulit sintetis premium tahan lama.', status: 'ACTIVE' },
  { code: 'ART-012', name: 'Cole Haan OriginalGrand Oxford', category: 'SEPATU', subCategory: 'SEPATU_FORMAL', brand: 'Cole Haan', purchasePrice: 1950000, sellingPrice: 2999000, tags: 'PREMIUM', description: 'Cole Haan OriginalGrand oxford kulit dengan sol Nike Air untuk kenyamanan sepanjang hari.', status: 'ACTIVE' },

  // TAS (7) — all ACTIVE
  { code: 'ART-013', name: 'Eiger Ransel Adventure 30L', category: 'TAS', subCategory: 'TAS_RANSEL', brand: 'Eiger', purchasePrice: 350000, sellingPrice: 599000, tags: 'BEST_SELLER,PREMIUM', description: 'Tas ransel Eiger Adventure 30L waterproof untuk outdoor & travel.', status: 'ACTIVE' },
  { code: 'ART-014', name: 'Consina Briefcase Kerja', category: 'TAS', subCategory: 'TAS_KERJA', brand: 'Consina', purchasePrice: 425000, sellingPrice: 750000, tags: 'PREMIUM', description: 'Tas kerja briefcase Consina kulit PU, muat laptop 15 inch.', status: 'ACTIVE' },
  { code: 'ART-015', name: 'Tommy Hilfiger Tote Bag', category: 'TAS', subCategory: 'TAS_TANGAN', brand: 'Tommy Hilfiger', purchasePrice: 980000, sellingPrice: 1599000, tags: 'FEATURED', description: 'Tas tangan tote Tommy Hilfiger dengan motif logo klasik.', status: 'ACTIVE' },
  { code: 'ART-016', name: 'Calvin Klein Sling Bag', category: 'TAS', subCategory: 'TAS_RANSEL', brand: 'Calvin Klein', purchasePrice: 750000, sellingPrice: 1199000, tags: 'NEW_ARRIVAL', description: 'Sling bag Calvin Klein minimalis dengan strap adjustable.', status: 'ACTIVE' },
  { code: 'ART-017', name: 'Nautica Travel Bag 45L', category: 'TAS', subCategory: 'TAS_TRAVEL', brand: 'Nautica', purchasePrice: 1150000, sellingPrice: 1899000, tags: 'PREMIUM,FEATURED', description: 'Tas travel Nautica 45L kabin-size dengan wheel system.', status: 'ACTIVE' },
  { code: 'ART-018', name: 'Eiger Daypack Urban', category: 'TAS', subCategory: 'TAS_RANSEL', brand: 'Eiger', purchasePrice: 275000, sellingPrice: 449000, tags: 'BEST_SELLER', description: 'Tas ransel Eiger Daypack Urban 20L untuk harian.', status: 'ACTIVE' },
  { code: 'ART-019', name: 'Wizard Backpack Pro', category: 'TAS', subCategory: 'TAS_RANSEL', brand: 'Wizard', purchasePrice: 380000, sellingPrice: 649000, tags: 'FEATURED', description: 'Tas ransel Wizard Backpack Pro dengan kompartemen laptop 17 inch.', status: 'ACTIVE' },

  // PAKAIAN (8) — all ACTIVE
  { code: 'ART-020', name: 'Levi\'s 511 Slim Fit Jeans', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Levi\'s', purchasePrice: 450000, sellingPrice: 799000, tags: 'BEST_SELLER', description: 'Levi\'s 511 Slim Fit Jeans pria, denim stretch nyaman.', status: 'ACTIVE' },
  { code: 'ART-021', name: 'Tommy Hilfiger Classic Polo', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Tommy Hilfiger', purchasePrice: 550000, sellingPrice: 949000, tags: 'NEW_ARRIVAL,FEATURED', description: 'Polo Tommy Hilfiger pria, material pique katun premium.', status: 'ACTIVE' },
  { code: 'ART-022', name: 'Calvin Klein Crew Neck Tee', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Calvin Klein', purchasePrice: 320000, sellingPrice: 549000, tags: 'BEST_SELLER', description: 'Kaos Calvin Klein crew neck pria dengan logo embroidery di dada.', status: 'ACTIVE' },
  { code: 'ART-023', name: 'Levi\'s Trucker Jacket', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Levi\'s', purchasePrice: 680000, sellingPrice: 1199000, tags: 'FEATURED', description: 'Levi\'s Trucker Jacket denim pria, ikon gaya sejak 1967.', status: 'ACTIVE' },
  { code: 'ART-024', name: 'Nautica Striped Dress', category: 'PAKAIAN', subCategory: 'PAKAIAN_WANITA', brand: 'Nautica', purchasePrice: 720000, sellingPrice: 1249000, tags: 'NEW_ARRIVAL', description: 'Dress Nautica stripe wanita, material katun rayon adem.', status: 'ACTIVE' },
  { code: 'ART-025', name: 'Tommy Hilfiger Blazer', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Tommy Hilfiger', purchasePrice: 1450000, sellingPrice: 2299000, tags: 'PREMIUM,EXCLUSIVE', description: 'Blazer Tommy Hilfiger formal two-button, wol premium.', status: 'ACTIVE' },
  { code: 'ART-026', name: 'Calvin Klein Sheath Dress', category: 'PAKAIAN', subCategory: 'PAKAIAN_WANITA', brand: 'Calvin Klein', purchasePrice: 1150000, sellingPrice: 1899000, tags: 'FEATURED', description: 'Sheath dress Calvin Klein wanita, elegan untuk acara formal.', status: 'ACTIVE' },
  { code: 'ART-027', name: 'Levi\'s 501 Original', category: 'PAKAIAN', subCategory: 'PAKAIAN_PRIA', brand: 'Levi\'s', purchasePrice: 580000, sellingPrice: 999000, tags: 'BEST_SELLER', description: 'Levi\'s 501 Original Fit Jeans, ikon denim sejak 1873.', status: 'ACTIVE' },

  // AKSESORIS (6) — all ACTIVE
  { code: 'ART-028', name: 'Casio G-Shock GA-2100', category: 'AKSESORIS', subCategory: 'AKS_JAM_TANGAN', brand: 'Casio', purchasePrice: 1450000, sellingPrice: 2199000, tags: 'EXCLUSIVE,PREMIUM', description: 'Jam tangan Casio G-Shock GA-2100 "Casioak" resin carbon core.', status: 'ACTIVE' },
  { code: 'ART-029', name: 'Calvin Klein Watch Mini', category: 'AKSESORIS', subCategory: 'AKS_JAM_TANGAN', brand: 'Calvin Klein', purchasePrice: 1150000, sellingPrice: 1799000, tags: 'FEATURED', description: 'Jam tangan Calvin Klein Mini, desain minimalis stainless steel.', status: 'ACTIVE' },
  { code: 'ART-030', name: 'Tommy Hilfiger Sunglasses', category: 'AKSESORIS', subCategory: 'AKS_KACAMATA', brand: 'Tommy Hilfiger', purchasePrice: 580000, sellingPrice: 949000, tags: 'NEW_ARRIVAL', description: 'Kacamata Tommy Hilfiger dengan UV400 protection dan frame acetate.', status: 'ACTIVE' },
  { code: 'ART-031', name: 'Nautica Cap Classic', category: 'AKSESORIS', subCategory: 'AKS_TOPI', brand: 'Nautica', purchasePrice: 280000, sellingPrice: 449000, tags: 'BEST_SELLER', description: 'Topi Nautica classic baseball cap dengan logo embroidery.', status: 'ACTIVE' },
  { code: 'ART-032', name: 'Cole Haan Belt Leather', category: 'AKSESORIS', subCategory: 'AKS_SABUK', brand: 'Cole Haan', purchasePrice: 580000, sellingPrice: 949000, tags: 'PREMIUM', description: 'Sabuk Cole Haan kulit asli dengan buckle stainless steel.', status: 'ACTIVE' },
  { code: 'ART-033', name: 'Dr. Martens Wallet', category: 'AKSESORIS', subCategory: 'AKS_DOMPET', brand: 'Dr. Martens', purchasePrice: 380000, sellingPrice: 649000, tags: 'FEATURED', description: 'Dompet Dr. Martens kulit PU dengan logo emboss dan slot kartu 8.', status: 'ACTIVE' },

  // KOSMETIK (6) — 2 ACTIVE + 4 DRAFT
  { code: 'ART-034', name: 'Sephora Foundation Liquid', category: 'KOSMETIK', subCategory: 'KOS_WAJAH', brand: 'Sephora', purchasePrice: 380000, sellingPrice: 599000, tags: 'BEST_SELLER', description: 'Foundation Sephora liquid dengan coverage medium dan finish matte tahan 12 jam.', status: 'ACTIVE' },
  { code: 'ART-035', name: 'Victoria\'s Secret Lip Gloss', category: 'KOSMETIK', subCategory: 'KOS_BIBIR', brand: 'Victoria\'s Secret', purchasePrice: 240000, sellingPrice: 399000, tags: 'NEW_ARRIVAL', description: 'Lip gloss Victoria\'s Secret dengan formula shiny non-sticky.', status: 'ACTIVE' },
  { code: 'ART-036', name: 'Sephora Eyeshadow Palette', category: 'KOSMETIK', subCategory: 'KOS_MATA', brand: 'Sephora', purchasePrice: 480000, sellingPrice: 749000, tags: 'FEATURED', description: 'Palette eyeshadow Sephora 12 warna dengan finish shimmer & matte.', status: 'DRAFT' },
  { code: 'ART-037', name: 'Victoria\'s Secret Bombshell EDP', category: 'KOSMETIK', subCategory: 'KOS_PARFUM', brand: 'Victoria\'s Secret', purchasePrice: 680000, sellingPrice: 1099000, tags: 'BEST_SELLER,EXCLUSIVE', description: 'Parfum Victoria\'s Secret Bombshell EDP 50ml, fruity floral signature.', status: 'DRAFT' },
  { code: 'ART-038', name: 'Sephora Liquid Lipstick', category: 'KOSMETIK', subCategory: 'KOS_BIBIR', brand: 'Sephora', purchasePrice: 220000, sellingPrice: 369000, tags: 'SALE', description: 'Liquid lipstick Sephora tahan lama dengan formula transferproof.', status: 'DRAFT' },
  { code: 'ART-039', name: 'Sephora Skincare Serum', category: 'KOSMETIK', subCategory: 'KOS_WAJAH', brand: 'Sephora', purchasePrice: 420000, sellingPrice: 699000, tags: 'NEW_ARRIVAL', description: 'Serum Sephora Vitamin C + Hyaluronic Acid untuk mencerahkan dan melembapkan.', status: 'DRAFT' },

  // MAKANAN (4) — all DRAFT
  { code: 'ART-040', name: 'Starbucks Whole Bean Coffee 250g', category: 'MAKANAN', subCategory: 'MINUMAN', brand: 'Starbucks', purchasePrice: 145000, sellingPrice: 249000, tags: 'BEST_SELLER', description: 'Kopi whole bean Starbucks House Blend 250g, medium roast.', status: 'DRAFT' },
  { code: 'ART-041', name: 'Starbucks VIA Instant Coffee', category: 'MAKANAN', subCategory: 'MINUMAN', brand: 'Starbucks', purchasePrice: 95000, sellingPrice: 165000, tags: 'FEATURED', description: 'Kopi instan Starbucks VIA Ready Brew 12 stick, praktis untuk dibawa.', status: 'DRAFT' },
  { code: 'ART-042', name: 'Foodhall Dark Chocolate 70%', category: 'MAKANAN', subCategory: 'MAKANAN_RINGAN', brand: 'Foodhall', purchasePrice: 78000, sellingPrice: 135000, tags: 'NEW_ARRIVAL', description: 'Dark chocolate Foodhall 70% cocoa, single origin Indonesia.', status: 'DRAFT' },
  { code: 'ART-043', name: 'Foodhall Premium Cookies', category: 'MAKANAN', subCategory: 'MAKANAN_KUE', brand: 'Foodhall', purchasePrice: 88000, sellingPrice: 149000, tags: 'BEST_SELLER', description: 'Cookies premium Foodhall butter cookies, isi 200g.', status: 'DRAFT' },

  // ELEKTRONIK (4) — all IN_REVIEW
  { code: 'ART-044', name: 'Samsung Galaxy A55 5G', category: 'ELEKTRONIK', subCategory: 'ELEK_HP', brand: 'Samsung', purchasePrice: 5200000, sellingPrice: 6999000, tags: 'NEW_ARRIVAL,FEATURED', description: 'Samsung Galaxy A55 5G dengan Super AMOLED 6.6" dan kamera 50MP OIS.', status: 'IN_REVIEW' },
  { code: 'ART-045', name: 'MacBook Air M2 13"', category: 'ELEKTRONIK', subCategory: 'ELEK_LAPTOP', brand: 'Apple', purchasePrice: 15500000, sellingPrice: 19999000, tags: 'PREMIUM,EXCLUSIVE', description: 'MacBook Air M2 13" dengan Liquid Retina display dan baterai 18 jam.', status: 'IN_REVIEW' },
  { code: 'ART-046', name: 'Anker Power Bank 20000mAh', category: 'ELEKTRONIK', subCategory: 'ELEK_AKSESORIS', brand: 'Anker', purchasePrice: 380000, sellingPrice: 599000, tags: 'BEST_SELLER', description: 'Power bank Anker 20000mAh dengan PowerIQ 3.0 dan USB-C PD 22.5W.', status: 'IN_REVIEW' },
  { code: 'ART-047', name: 'Sony WH-1000XM5 Headphone', category: 'ELEKTRONIK', subCategory: 'ELEK_AUDIO', brand: 'Sony', purchasePrice: 4200000, sellingPrice: 5999000, tags: 'PREMIUM,FEATURED', description: 'Sony WH-1000XM5 wireless noise-cancelling headphone premium.', status: 'IN_REVIEW' },

  // OLAHRAGA (3) — 1 IN_REVIEW + 2 REVISION_PENDING
  { code: 'ART-048', name: 'Nike Dri-FIT Training Tee', category: 'OLAHRAGA', subCategory: 'OLA_FITNESS', brand: 'Nike', purchasePrice: 280000, sellingPrice: 449000, tags: 'NEW_ARRIVAL', description: 'Kaos training Nike Dri-FIT pria, material kering cepat dan ringan.', status: 'IN_REVIEW' },
  { code: 'ART-049', name: 'Polygon Mountain Bike Xtrada 7', category: 'OLAHRAGA', subCategory: 'OLA_SEPEDA', brand: 'Polygon', purchasePrice: 8500000, sellingPrice: 12499000, tags: 'PREMIUM,FEATURED', description: 'Sepeda gunung Polygon Xtrada 7 frame alloy 29er dengan Shimano Deore 1x12.', status: 'REVISION_PENDING' },
  { code: 'ART-050', name: 'Speedo Swim Goggles Vanquisher', category: 'OLAHRAGA', subCategory: 'OLA_RENANG', brand: 'Speedo', purchasePrice: 220000, sellingPrice: 349000, tags: 'BEST_SELLER', description: 'Kacamata renang Speedo Vanquisher 2.0 dengan lensa anti-fog dan UV protection.', status: 'REVISION_PENDING' },
];

// ── Store seed data (12 MAP mall locations) ────────────────────
const STORE_SEEDS: StoreSeed[] = [
  { code: 'STR-001', name: 'MAP Active Grand Indonesia', region: 'JABODETABEK', city: 'Jakarta', address: 'Grand Indonesia Mall Lt.1, Jl. MH Thamrin No.1', phone: '+62212555789', storeType: 'HYPERMARKET', openingDate: '2010-05-15' },
  { code: 'STR-002', name: 'MAP Active Pondok Indah Mall', region: 'JABODETABEK', city: 'Jakarta', address: 'Pondok Indah Mall Lt.2, Jl. Metro Pondok Indah', phone: '+62212789012', storeType: 'SUPERMARKET', openingDate: '2011-08-22' },
  { code: 'STR-003', name: 'MAP Active Tunjungan Plaza', region: 'EAST_JAVA', city: 'Surabaya', address: 'Tunjungan Plaza Lt.3, Jl. Tunjungan No. 65-71', phone: '+62315678901', storeType: 'HYPERMARKET', openingDate: '2012-11-30' },
  { code: 'STR-004', name: 'Starbucks Pacific Place', region: 'JABODETABEK', city: 'Jakarta', address: 'Pacific Place Mall Lt.G, Jl. SCBD No.1', phone: '+62212555432', storeType: 'SPECIALTY', openingDate: '2009-03-10' },
  { code: 'STR-005', name: 'Sephora Senayan City', region: 'JABODETABEK', city: 'Jakarta', address: 'Senayan City Mall Lt.1, Jl. Asia Afrika No.8', phone: '+62215789012', storeType: 'SPECIALTY', openingDate: '2013-07-18' },
  { code: 'STR-006', name: 'Nike Plaza Indonesia', region: 'JABODETABEK', city: 'Jakarta', address: 'Plaza Indonesia Lt.2, Jl. MH Thamrin Kav. 28-30', phone: '+62212903456', storeType: 'SPECIALTY', openingDate: '2008-10-05' },
  { code: 'STR-007', name: 'MAP Active Mal Taman Anggrek', region: 'JABODETABEK', city: 'Jakarta', address: 'Mal Taman Anggrek Lt.1, Jl. Letjen S. Parman Kav. 21', phone: '+62215678123', storeType: 'HYPERMARKET', openingDate: '2014-12-01' },
  { code: 'STR-008', name: 'MAP Active Bandung Indah Plaza', region: 'WEST_JAVA', city: 'Bandung', address: 'Bandung Indah Plaza Lt.1, Jl. Merdeka No. 60', phone: '+62224567890', storeType: 'SUPERMARKET', openingDate: '2015-06-12' },
  { code: 'STR-009', name: 'Victoria\'s Secret Lippo Mall Kemang', region: 'JABODETABEK', city: 'Jakarta', address: 'Lippo Mall Kemang Lt.1, Jl. Pangeran Antasari No.36', phone: '+62212799012', storeType: 'SPECIALTY', openingDate: '2016-09-25' },
  { code: 'STR-010', name: 'MAP Active Mal Kelapa Gading', region: 'JABODETABEK', city: 'Jakarta', address: 'Mal Kelapa Gading Lt.2, Jl. Boulevard Kelapa Gading', phone: '+62214580123', storeType: 'HYPERMARKET', openingDate: '2017-04-14' },
  { code: 'STR-011', name: 'Levi\'s Bali Collection', region: 'BALI_NT', city: 'Kuta', address: 'Bali Collection Lt.1, Jl. By Pass Ngurah Rai, Nusa Dua', phone: '+62361789012', storeType: 'SPECIALTY', openingDate: '2018-07-30' },
  { code: 'STR-012', name: 'MAP Active Trans Studio Mall Makassar', region: 'SULAWESI', city: 'Makassar', address: 'Trans Studio Mall Lt.1, Jl. Metro Tanjung Bunga', phone: '+62411890123', storeType: 'SUPERMARKET', openingDate: '2019-11-08' },
];

// ── Supplier seed data (12 brand distributors) ─────────────────
const SUPPLIER_SEEDS: SupplierSeed[] = [
  { code: 'SUP-001', name: 'PT Nike Indonesia', type: 'MANUFACTURER', contact: 'Budi Santoso', email: 'procurement@nike.co.id', phone: '+62215550101', address: 'Jl. Industri No. 5, Kawasan Industri Pulogadung', city: 'Jakarta', taxId: '01.234.567.8-091.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-002', name: 'PT Adidas Indonesia', type: 'MANUFACTURER', contact: 'Siti Rahmawati', email: 'supply.id@adidas.com', phone: '+62215550102', address: 'Jl. MH Thamrin No. 28', city: 'Jakarta', taxId: '01.345.678.9-092.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-003', name: 'PT Converse Indonesia', type: 'DISTRIBUTOR', contact: 'Andi Wijaya', email: 'id.orders@converse.com', phone: '+62215550103', address: 'Jl. Sudirman Kav. 52-53', city: 'Jakarta', taxId: '01.456.789.0-093.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-004', name: 'PT Skechers SEA', type: 'DISTRIBUTOR', contact: 'Maya Putri', email: 'sea.procurement@skechers.com', phone: '+62215550104', address: 'SCBD Lot 14, Jl. Jend. Sudirman', city: 'Jakarta', taxId: '01.567.890.1-094.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-005', name: 'PT Levi Strauss Indonesia', type: 'MANUFACTURER', contact: 'Rudi Hartono', email: 'id.supply@levi.com', phone: '+62215550105', address: 'Jl. Gajah Mada No. 88', city: 'Jakarta', taxId: '01.678.901.2-095.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-006', name: 'PT Tommy Hilfiger Asia', type: 'DISTRIBUTOR', contact: 'Linda Kusuma', email: 'asia.supply@tommy.com', phone: '+62215550106', address: 'Pacific Place Lt. 12, Jl. SCBD', city: 'Jakarta', taxId: '01.789.012.3-096.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-007', name: 'PT Calvin Klein Indonesia', type: 'DISTRIBUTOR', contact: 'Dewi Lestari', email: 'id.b2b@calvinklein.com', phone: '+62215550107', address: 'World Trade Centre 3, Jl. H.R. Rasuna Said', city: 'Jakarta', taxId: '01.890.123.4-097.000', paymentTerms: 'NET_60', status: 'ACTIVE' },
  { code: 'SUP-008', name: 'PT Sephora Indonesia', type: 'WHOLESALER', contact: 'Ratna Sari', email: 'id.wholesale@sephora.com', phone: '+62215550108', address: 'Senayan City Lt. 5, Jl. Asia Afrika', city: 'Jakarta', taxId: '01.901.234.5-098.000', paymentTerms: 'NET_30', status: 'ACTIVE' },
  { code: 'SUP-009', name: 'PT Victoria\'s Secret Indonesia', type: 'DISTRIBUTOR', contact: 'Indah Permatasari', email: 'id.distribution@victoriassecret.com', phone: '+62215550109', address: 'Lippo Mall Kemang Lt. 3, Jl. Pangeran Antasari', city: 'Jakarta', taxId: '01.012.345.6-099.000', paymentTerms: 'NET_90', status: 'ACTIVE' },
  { code: 'SUP-010', name: 'PT Starbucks Coffee Indonesia', type: 'MANUFACTURER', contact: 'Hendra Gunawan', email: 'procurement@starbucks.co.id', phone: '+62215550110', address: 'Jl. Budi Kemulianan No. 1, Kebon Jeruk', city: 'Jakarta', taxId: '01.135.791.3-100.000', paymentTerms: 'COD', status: 'DRAFT' },
  { code: 'SUP-011', name: 'PT Cole Haan Asia', type: 'WHOLESALER', contact: 'Fitri Handayani', email: 'asia.orders@colehaan.com', phone: '+62215550111', address: 'Menara Anugrah Lt. 10, Jl. Jend. Gatot Subroto', city: 'Jakarta', taxId: '01.246.802.4-101.000', paymentTerms: 'NET_60', status: 'IN_REVIEW' },
  { code: 'SUP-012', name: 'CV Eiger Adventure', type: 'LOCAL', contact: 'Bambang Pratama', email: 'supply@eigeradventure.com', phone: '+62225550112', address: 'Jl. Cibadak No. 78', city: 'Bandung', taxId: '02.369.147.0-102.000', paymentTerms: 'CBD', status: 'IN_REVIEW' },
];

// ── Pricing seed data (15 records, link to ART-001..ART-015) ───
const PRICING_SEEDS: PricingSeed[] = [
  { code: 'PRC-001', articleCode: 'ART-001', priceType: 'REGULAR', price: 1899000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-002', articleCode: 'ART-001', priceType: 'COST', price: 1200000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-003', articleCode: 'ART-002', priceType: 'REGULAR', price: 3299000, currency: 'IDR', effectiveDate: '2024-02-01', expiryDate: '2025-01-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-004', articleCode: 'ART-002', priceType: 'WHOLESALE', price: 2950000, currency: 'IDR', effectiveDate: '2024-02-01', expiryDate: '2025-01-31', storeType: 'SUPERMARKET', region: 'WEST_JAVA' },
  { code: 'PRC-005', articleCode: 'ART-003', priceType: 'REGULAR', price: 1299000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2025-02-28', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-006', articleCode: 'ART-003', priceType: 'PROMOTIONAL', price: 999000, currency: 'IDR', effectiveDate: '2024-06-01', expiryDate: '2024-06-30', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-007', articleCode: 'ART-004', priceType: 'REGULAR', price: 1199000, currency: 'IDR', effectiveDate: '2024-01-15', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'EAST_JAVA' },
  { code: 'PRC-008', articleCode: 'ART-005', priceType: 'REGULAR', price: 1699000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-009', articleCode: 'ART-005', priceType: 'PROMOTIONAL', price: 1399000, currency: 'IDR', effectiveDate: '2024-07-01', expiryDate: '2024-07-31', storeType: 'SUPERMARKET', region: 'WEST_JAVA' },
  { code: 'PRC-010', articleCode: 'ART-006', priceType: 'REGULAR', price: 1599000, currency: 'IDR', effectiveDate: '2024-04-01', expiryDate: '2025-03-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
  { code: 'PRC-011', articleCode: 'ART-007', priceType: 'REGULAR', price: 1499000, currency: 'IDR', effectiveDate: '2024-02-15', expiryDate: '2025-02-14', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-012', articleCode: 'ART-008', priceType: 'REGULAR', price: 1099000, currency: 'IDR', effectiveDate: '2024-03-01', expiryDate: '2025-02-28', storeType: 'SUPERMARKET', region: 'SUMATRA' },
  { code: 'PRC-013', articleCode: 'ART-009', priceType: 'REGULAR', price: 2899000, currency: 'IDR', effectiveDate: '2024-05-01', expiryDate: '2025-04-30', storeType: 'SPECIALTY', region: 'BALI_NT' },
  { code: 'PRC-014', articleCode: 'ART-010', priceType: 'WHOLESALE', price: 999000, currency: 'IDR', effectiveDate: '2024-01-01', expiryDate: '2024-12-31', storeType: 'HYPERMARKET', region: 'JABODETABEK' },
  { code: 'PRC-015', articleCode: 'ART-011', priceType: 'REGULAR', price: 799000, currency: 'IDR', effectiveDate: '2024-06-01', expiryDate: '2025-05-31', storeType: 'SPECIALTY', region: 'JABODETABEK' },
];

// ── Promotion seed data (8 MAP-style campaigns) ────────────────
const PROMOTION_SEEDS: PromotionSeed[] = [
  { code: 'PROMO-001', name: 'Summer Sale 2024', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 25, startDate: '2024-06-01', endDate: '2024-07-31', applicableCategories: 'CLOTHING,FOOTWEAR', minPurchase: 500000, maxDiscount: 500000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-002', name: 'Buy 1 Get 1 Coffee', promoType: 'BOGO', discountType: 'PERCENTAGE', discountValue: 100, startDate: '2024-08-01', endDate: '2024-08-31', applicableCategories: 'FOOD', minPurchase: 0, maxDiscount: 250000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-003', name: 'Back to School Bundle', promoType: 'BUNDLE', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-07-01', endDate: '2024-07-31', applicableCategories: 'STATIONERY,FOOTWEAR', minPurchase: 750000, maxDiscount: 200000, storeType: 'SUPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-004', name: 'Flash Sale Electronics', promoType: 'FLASH_SALE', discountType: 'PERCENTAGE', discountValue: 40, startDate: '2024-09-15', endDate: '2024-09-17', applicableCategories: 'ELECTRONICS', minPurchase: 1000000, maxDiscount: 1500000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-005', name: 'Year End Clearance', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 30, startDate: '2024-12-01', endDate: '2024-12-31', applicableCategories: 'CLOTHING,FOOTWEAR,ACCESSORIES', minPurchase: 0, maxDiscount: 1000000, storeType: 'HYPERMARKET', status: 'ACTIVE' },
  { code: 'PROMO-006', name: 'Sephora Beauty Festival', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 20, startDate: '2024-10-01', endDate: '2024-10-31', applicableCategories: 'KOSMETIK', minPurchase: 300000, maxDiscount: 400000, storeType: 'SPECIALTY', status: 'ACTIVE' },
  { code: 'PROMO-007', name: 'Nike Running Week', promoType: 'DISCOUNT', discountType: 'PERCENTAGE', discountValue: 15, startDate: '2024-05-01', endDate: '2024-05-07', applicableCategories: 'SEPATU_RUNNING', minPurchase: 1000000, maxDiscount: 300000, storeType: 'SPECIALTY', status: 'IN_REVIEW' },
  { code: 'PROMO-008', name: 'Ramadan Special Bundle', promoType: 'BUNDLE', discountType: 'PERCENTAGE', discountValue: 25, startDate: '2024-03-10', endDate: '2024-04-09', applicableCategories: 'PAKAIAN_MUSLIM', minPurchase: 800000, maxDiscount: 500000, storeType: 'HYPERMARKET', status: 'DRAFT' },
];

// ── Curated Unsplash image URLs per category (stable hotlinks) ─
const SHOE_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop',
];
const BAG_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=400&h=400&fit=crop',
];
const CLOTHING_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=400&fit=crop',
];
const ACCESSORY_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1521369909029-2afed882ba98?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=400&h=400&fit=crop',
];
const BEAUTY_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583241800698-9c2e0d5d2117?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&h=400&fit=crop',
];
const FOOD_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&h=400&fit=crop',
];
const ELECTRONICS_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop',
];
const SPORTS_PHOTOS: string[] = [
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&h=400&fit=crop',
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
    case 'SEPATU': return SHOE_PHOTOS;
    case 'TAS': return BAG_PHOTOS;
    case 'PAKAIAN': return CLOTHING_PHOTOS;
    case 'AKSESORIS': return ACCESSORY_PHOTOS;
    case 'KOSMETIK': return BEAUTY_PHOTOS;
    case 'MAKANAN': return FOOD_PHOTOS;
    case 'ELEKTRONIK': return ELECTRONICS_PHOTOS;
    case 'OLAHRAGA': return SPORTS_PHOTOS;
    default: return SHOE_PHOTOS;
  }
}

// ============================================================
// MAIN POST HANDLER
// ============================================================
export async function POST(request: NextRequest) {
  try {
    // ── Authorization: Super Admin only ────────────────────────
    const tokenPayload = getTokenFromHeaders(request.headers);
    if (!tokenPayload || !isSuperAdmin(tokenPayload.roles)) {
      return NextResponse.json(
        { error: 'Only Super Admin can run this reseed' },
        { status: 403 }
      );
    }

    // Typed summary object so we can call summary.steps.push() without
    // tripping TS18046 ("'summary.steps' is of type 'unknown'").
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

    // ── Resolve modules by code (proper map loop) ──────────────
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
    // Validate that every required module exists
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
      // 1a. ImageAsset records where record.moduleId in (5 modules)
      const delImages = await tx.imageAsset.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      // 1b. ApprovalTicket records where record.moduleId in (5 modules)
      const delTickets = await tx.approvalTicket.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      // 1c. DataVersion records where record.moduleId in (5 modules)
      const delVersions = await tx.dataVersion.deleteMany({
        where: { record: { moduleId: { in: moduleIds } } },
      });
      // 1d. DataRecord records where moduleId in (5 modules)
      const delRecords = await tx.dataRecord.deleteMany({
        where: { moduleId: { in: moduleIds } },
      });
      // 1e. FileAsset records where category='image' (orphaned image blobs)
      const delFileAssets = await tx.fileAsset.deleteMany({
        where: { category: 'image' },
      });
      // 1f. HierarchyNode records where hierarchy.moduleId = ARTICLE_MASTER
      const delHierarchyNodes = await tx.hierarchyNode.deleteMany({
        where: { hierarchy: { moduleId: articleModuleId } },
      });
      // 1g. HierarchyModel records where moduleId = ARTICLE_MASTER
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

    // ── 2a. CATEGORY lookup (8 Indonesian retail categories) ───
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
      { valueCode: 'SEPATU', displayValue: 'Sepatu', sortOrder: 0 },
      { valueCode: 'TAS', displayValue: 'Tas', sortOrder: 1 },
      { valueCode: 'PAKAIAN', displayValue: 'Pakaian', sortOrder: 2 },
      { valueCode: 'AKSESORIS', displayValue: 'Aksesoris', sortOrder: 3 },
      { valueCode: 'KOSMETIK', displayValue: 'Kosmetik & Beauty', sortOrder: 4 },
      { valueCode: 'MAKANAN', displayValue: 'Makanan & Minuman', sortOrder: 5 },
      { valueCode: 'ELEKTRONIK', displayValue: 'Elektronik', sortOrder: 6 },
      { valueCode: 'OLAHRAGA', displayValue: 'Perlengkapan Olahraga', sortOrder: 7 },
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
      `Step 2a CATEGORY: upserted ${newCategoryValues.length} Indonesian values, ` +
      `deactivated ${oldCatDeactivated.count} stale values`
    );

    // ── 2b. SUB_CATEGORY lookup (35 cascading child values) ────
    let subCategoryLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'SUB_CATEGORY' },
    });
    if (!subCategoryLookup) {
      subCategoryLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'SUB_CATEGORY',
          lookupName: 'Article Sub Category',
          description: 'Sub-kategori artikel dengan relasi ke Category (cascading)',
        },
      });
    }
    const subCategoryValues: Array<{ valueCode: string; displayValue: string; parentValueCode: string; sortOrder: number }> = [
      // SEPATU (6)
      { valueCode: 'SEPATU_RUNNING', displayValue: 'Sepatu Running', parentValueCode: 'SEPATU', sortOrder: 0 },
      { valueCode: 'SEPATU_SNEAKERS', displayValue: 'Sepatu Sneakers', parentValueCode: 'SEPATU', sortOrder: 1 },
      { valueCode: 'SEPATU_SEKOLAH', displayValue: 'Sepatu Sekolah', parentValueCode: 'SEPATU', sortOrder: 2 },
      { valueCode: 'SEPATU_BOOT', displayValue: 'Sepatu Boot', parentValueCode: 'SEPATU', sortOrder: 3 },
      { valueCode: 'SEPATU_SANDAL', displayValue: 'Sepatu Sandal', parentValueCode: 'SEPATU', sortOrder: 4 },
      { valueCode: 'SEPATU_FORMAL', displayValue: 'Sepatu Formal', parentValueCode: 'SEPATU', sortOrder: 5 },
      // TAS (5)
      { valueCode: 'TAS_RANSEL', displayValue: 'Tas Ransel', parentValueCode: 'TAS', sortOrder: 6 },
      { valueCode: 'TAS_KERJA', displayValue: 'Tas Kerja', parentValueCode: 'TAS', sortOrder: 7 },
      { valueCode: 'TAS_TANGAN', displayValue: 'Tas Tangan', parentValueCode: 'TAS', sortOrder: 8 },
      { valueCode: 'TAS_SEKOLAH', displayValue: 'Tas Sekolah', parentValueCode: 'TAS', sortOrder: 9 },
      { valueCode: 'TAS_TRAVEL', displayValue: 'Tas Travel', parentValueCode: 'TAS', sortOrder: 10 },
      // PAKAIAN (4)
      { valueCode: 'PAKAIAN_PRIA', displayValue: 'Pakaian Pria', parentValueCode: 'PAKAIAN', sortOrder: 11 },
      { valueCode: 'PAKAIAN_WANITA', displayValue: 'Pakaian Wanita', parentValueCode: 'PAKAIAN', sortOrder: 12 },
      { valueCode: 'PAKAIAN_ANAK', displayValue: 'Pakaian Anak', parentValueCode: 'PAKAIAN', sortOrder: 13 },
      { valueCode: 'PAKAIAN_MUSLIM', displayValue: 'Pakaian Muslim', parentValueCode: 'PAKAIAN', sortOrder: 14 },
      // AKSESORIS (6)
      { valueCode: 'AKS_JAM_TANGAN', displayValue: 'Jam Tangan', parentValueCode: 'AKSESORIS', sortOrder: 15 },
      { valueCode: 'AKS_KACAMATA', displayValue: 'Kacamata', parentValueCode: 'AKSESORIS', sortOrder: 16 },
      { valueCode: 'AKS_TOPI', displayValue: 'Topi', parentValueCode: 'AKSESORIS', sortOrder: 17 },
      { valueCode: 'AKS_SABUK', displayValue: 'Sabuk', parentValueCode: 'AKSESORIS', sortOrder: 18 },
      { valueCode: 'AKS_DOMPET', displayValue: 'Dompet', parentValueCode: 'AKSESORIS', sortOrder: 19 },
      { valueCode: 'AKS_PERHIASAN', displayValue: 'Perhiasan', parentValueCode: 'AKSESORIS', sortOrder: 20 },
      // KOSMETIK (4)
      { valueCode: 'KOS_WAJAH', displayValue: 'Makeup Wajah', parentValueCode: 'KOSMETIK', sortOrder: 21 },
      { valueCode: 'KOS_BIBIR', displayValue: 'Makeup Bibir', parentValueCode: 'KOSMETIK', sortOrder: 22 },
      { valueCode: 'KOS_MATA', displayValue: 'Makeup Mata', parentValueCode: 'KOSMETIK', sortOrder: 23 },
      { valueCode: 'KOS_PARFUM', displayValue: 'Parfum', parentValueCode: 'KOSMETIK', sortOrder: 24 },
      // MAKANAN (3)
      { valueCode: 'MAKANAN_RINGAN', displayValue: 'Makanan Ringan', parentValueCode: 'MAKANAN', sortOrder: 25 },
      { valueCode: 'MINUMAN', displayValue: 'Minuman', parentValueCode: 'MAKANAN', sortOrder: 26 },
      { valueCode: 'MAKANAN_KUE', displayValue: 'Kue & Roti', parentValueCode: 'MAKANAN', sortOrder: 27 },
      // ELEKTRONIK (4)
      { valueCode: 'ELEK_HP', displayValue: 'Handphone', parentValueCode: 'ELEKTRONIK', sortOrder: 28 },
      { valueCode: 'ELEK_LAPTOP', displayValue: 'Laptop', parentValueCode: 'ELEKTRONIK', sortOrder: 29 },
      { valueCode: 'ELEK_AKSESORIS', displayValue: 'Aksesoris Elektronik', parentValueCode: 'ELEKTRONIK', sortOrder: 30 },
      { valueCode: 'ELEK_AUDIO', displayValue: 'Audio Elektronik', parentValueCode: 'ELEKTRONIK', sortOrder: 31 },
      // OLAHRAGA (3)
      { valueCode: 'OLA_FITNESS', displayValue: 'Fitness & Gym', parentValueCode: 'OLAHRAGA', sortOrder: 32 },
      { valueCode: 'OLA_SEPEDA', displayValue: 'Sepeda', parentValueCode: 'OLAHRAGA', sortOrder: 33 },
      { valueCode: 'OLA_RENANG', displayValue: 'Renang', parentValueCode: 'OLAHRAGA', sortOrder: 34 },
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
    // Resolve parentValueId from parentValueCode — note that parentValueCode
    // on SUB_CATEGORY values points to CATEGORY codes (cross-lookup), so we
    // must fetch CATEGORY lookup values to build the code→id map.
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
    lookupsUpdated += subCategoryValues.length;
    summary.steps.push(
      `Step 2b SUB_CATEGORY: upserted ${subCategoryValues.length} cascading child values + resolved parentValueId (cross-lookup to CATEGORY)`
    );

    // ── 2c. ARTICLE_TAGS lookup (keep existing 7 tags) ─────────
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

    // ── 2d. BRAND lookup (new — 20 MAP-carried brands) ─────────
    // Per task spec, the brand field on Article Master remains TEXT to avoid
    // breaking existing data. The lookup is created for future use only.
    let brandLookup = await db.lookupMaster.findUnique({
      where: { lookupCode: 'BRAND' },
    });
    if (!brandLookup) {
      brandLookup = await db.lookupMaster.create({
        data: {
          lookupCode: 'BRAND',
          lookupName: 'Article Brand',
          description: 'MAP Active brand catalog (Nike, Adidas, Converse, etc.)',
        },
      });
    }
    const brandValues = [
      { valueCode: 'NIKE', displayValue: 'Nike', sortOrder: 0 },
      { valueCode: 'ADIDAS', displayValue: 'Adidas', sortOrder: 1 },
      { valueCode: 'CONVERSE', displayValue: 'Converse', sortOrder: 2 },
      { valueCode: 'SKECHERS', displayValue: 'Skechers', sortOrder: 3 },
      { valueCode: 'LEVIS', displayValue: "Levi's", sortOrder: 4 },
      { valueCode: 'TOMMY_HILFIGER', displayValue: 'Tommy Hilfiger', sortOrder: 5 },
      { valueCode: 'CALVIN_KLEIN', displayValue: 'Calvin Klein', sortOrder: 6 },
      { valueCode: 'NAUTICA', displayValue: 'Nautica', sortOrder: 7 },
      { valueCode: 'WIZARD', displayValue: 'Wizard', sortOrder: 8 },
      { valueCode: 'CUPCAKES', displayValue: 'Cupcakes', sortOrder: 9 },
      { valueCode: 'PAYLESS', displayValue: 'Payless', sortOrder: 10 },
      { valueCode: 'SEPHORA', displayValue: 'Sephora', sortOrder: 11 },
      { valueCode: 'VICTORIA_SECRET', displayValue: "Victoria's Secret", sortOrder: 12 },
      { valueCode: 'COLE_HAAN', displayValue: 'Cole Haan', sortOrder: 13 },
      { valueCode: 'PUMA', displayValue: 'Puma', sortOrder: 14 },
      { valueCode: 'NEW_BALANCE', displayValue: 'New Balance', sortOrder: 15 },
      { valueCode: 'VANS', displayValue: 'Vans', sortOrder: 16 },
      { valueCode: 'DR_MARTENS', displayValue: 'Dr. Martens', sortOrder: 17 },
      { valueCode: 'EIGER', displayValue: 'Eiger', sortOrder: 18 },
      { valueCode: 'CONSINA', displayValue: 'Consina', sortOrder: 19 },
    ];
    for (const v of brandValues) {
      await db.lookupValue.upsert({
        where: { lookupId_valueCode: { lookupId: brandLookup.id, valueCode: v.valueCode } },
        create: { lookupId: brandLookup.id, ...v, isActive: true },
        update: { displayValue: v.displayValue, sortOrder: v.sortOrder, isActive: true },
      });
    }
    lookupsUpdated += brandValues.length;
    summary.steps.push(`Step 2d BRAND: upserted ${brandValues.length} MAP-carried brand values (lookup created for future use — brand field remains TEXT)`);

    // ============================================================
    // STEP 3: RECREATE ARTICLE HIERARCHY (3-level MAP structure)
    // ============================================================
    const hierarchy = await db.hierarchyModel.create({
      data: {
        moduleId: articleModuleId,
        hierarchyName: 'MAP Article Hierarchy',
        description: '3-level hierarchy: Pria/Wanita/Anak/Unisex → Sepatu/Pakaian/... → Running/Sneakers/...',
      },
    });

    // Level 0 — roots
    const nodePria = await db.hierarchyNode.create({
      data: {
        hierarchyId: hierarchy.id,
        nodeLabel: 'Pria',
        materializedPath: '',
        depthLevel: 0,
        sortOrder: 0,
        status: 'ACTIVE',
      },
    });
    const nodeWanita = await db.hierarchyNode.create({
      data: {
        hierarchyId: hierarchy.id,
        nodeLabel: 'Wanita',
        materializedPath: '',
        depthLevel: 0,
        sortOrder: 1,
        status: 'ACTIVE',
      },
    });
    const nodeAnak = await db.hierarchyNode.create({
      data: {
        hierarchyId: hierarchy.id,
        nodeLabel: 'Anak',
        materializedPath: '',
        depthLevel: 0,
        sortOrder: 2,
        status: 'ACTIVE',
      },
    });
    const nodeUnisex = await db.hierarchyNode.create({
      data: {
        hierarchyId: hierarchy.id,
        nodeLabel: 'Unisex',
        materializedPath: '',
        depthLevel: 0,
        sortOrder: 3,
        status: 'ACTIVE',
      },
    });

    // Level 1 — under each root
    const l1Pria = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodePria.id, nodeLabel: 'Sepatu Pria', materializedPath: nodePria.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodePria.id, nodeLabel: 'Pakaian Pria', materializedPath: nodePria.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodePria.id, nodeLabel: 'Aksesoris Pria', materializedPath: nodePria.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodePria.id, nodeLabel: 'Tas Pria', materializedPath: nodePria.id, depthLevel: 1, sortOrder: 3, status: 'ACTIVE' } }),
    ]);
    const l1Wanita = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWanita.id, nodeLabel: 'Sepatu Wanita', materializedPath: nodeWanita.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWanita.id, nodeLabel: 'Pakaian Wanita', materializedPath: nodeWanita.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWanita.id, nodeLabel: 'Aksesoris Wanita', materializedPath: nodeWanita.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWanita.id, nodeLabel: 'Tas Wanita', materializedPath: nodeWanita.id, depthLevel: 1, sortOrder: 3, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeWanita.id, nodeLabel: 'Kosmetik & Beauty', materializedPath: nodeWanita.id, depthLevel: 1, sortOrder: 4, status: 'ACTIVE' } }),
    ]);
    const l1Anak = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeAnak.id, nodeLabel: 'Sepatu Anak', materializedPath: nodeAnak.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeAnak.id, nodeLabel: 'Pakaian Anak', materializedPath: nodeAnak.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeAnak.id, nodeLabel: 'Mainan & Aksesoris', materializedPath: nodeAnak.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
    ]);
    const l1Unisex = await Promise.all([
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Sepatu Olahraga', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 0, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Elektronik', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 1, status: 'ACTIVE' } }),
      db.hierarchyNode.create({ data: { hierarchyId: hierarchy.id, parentNodeId: nodeUnisex.id, nodeLabel: 'Makanan & Minuman', materializedPath: nodeUnisex.id, depthLevel: 1, sortOrder: 2, status: 'ACTIVE' } }),
    ]);

    // Level 2 — under each "Sepatu X" node and "Pakaian X" node and "Kosmetik & Beauty"
    const l2SepatuLabels = ['Running', 'Sneakers', 'Formal', 'Boot'];
    const l2PakaianLabels = ['Atasan', 'Bawahan', 'Outerwear'];
    const l2KosmetikLabels = ['Wajah', 'Bibir', 'Mata', 'Parfum'];

    // Helper to create a batch of level-2 children under a given parent node.
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

    // All "Sepatu X" nodes get the same 4 sub-labels
    const sepatuNodes = [l1Pria[0], l1Wanita[0], l1Anak[0], l1Unisex[0]];
    for (const n of sepatuNodes) {
      await createL2Batch(n, l2SepatuLabels, 0);
    }
    // All "Pakaian X" nodes get the same 3 sub-labels
    const pakaianNodes = [l1Pria[1], l1Wanita[1], l1Anak[1]];
    for (const n of pakaianNodes) {
      await createL2Batch(n, l2PakaianLabels, 0);
    }
    // Kosmetik & Beauty node (under Wanita) gets 4 sub-labels
    await createL2Batch(l1Wanita[4], l2KosmetikLabels, 0);

    // Count hierarchy nodes created (4 roots + 16 L1 + 4*4 Sepatu L2 + 3*3 Pakaian L2 + 4 Kosmetik L2 = 4+16+16+9+4 = 49)
    const hierarchyNodesCount = 4 + 16 + (4 * l2SepatuLabels.length) + (3 * l2PakaianLabels.length) + l2KosmetikLabels.length;
    summary.steps.push(
      `Step 3 Hierarchy: created "MAP Article Hierarchy" with 4 roots (Pria/Wanita/Anak/Unisex) + 16 level-1 nodes + ${hierarchyNodesCount - 20} level-2 nodes = ${hierarchyNodesCount} total nodes`
    );

    // ============================================================
    // STEP 4: CREATE SAMPLE DATA RECORDS
    // ============================================================
    let articlesCreated = 0;
    let storesCreated = 0;
    let suppliersCreated = 0;
    let pricingsCreated = 0;
    let promotionsCreated = 0;

    // Track created article records by code so we can attach version
    // snapshots / approval tickets after creation.
    const articleRecordByCode: Record<string, { id: string; currentPayload: string; createdById: string | null }> = {};

    // ── 4a. ARTICLE_MASTER records (50) ────────────────────────
    for (const seed of ARTICLE_SEEDS) {
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
      articleRecordByCode[seed.code] = {
        id: record.id,
        currentPayload: payloadStr,
        createdById: superAdmin.id,
      };
      articlesCreated++;

      // Status-dependent side effects:
      //  - ACTIVE: DataVersion(version=1, status=ACTIVE, reason="Initial creation (auto-approved)")
      //  - IN_REVIEW: ApprovalTicket(status=PENDING, deltaPayload=currentPayload)
      //  - REVISION_PENDING: DataVersion(version=1, ACTIVE) + ApprovalTicket(PENDING)
      //    (simulates an active record that was edited and is pending re-approval)
      //  - DRAFT: nothing extra
      if (seed.status === 'ACTIVE') {
        await db.dataVersion.create({
          data: {
            recordId: record.id,
            payloadSnapshot: payloadStr,
            versionNumber: 1,
            changedById: superAdmin.id,
            changeReason: 'Initial creation (auto-approved)',
            status: 'ACTIVE',
          },
        });
      } else if (seed.status === 'IN_REVIEW') {
        await db.approvalTicket.create({
          data: {
            recordId: record.id,
            requestedById: superAdmin.id,
            status: 'PENDING',
            deltaPayload: payloadStr,
          },
        });
      } else if (seed.status === 'REVISION_PENDING') {
        await db.dataVersion.create({
          data: {
            recordId: record.id,
            payloadSnapshot: payloadStr,
            versionNumber: 1,
            changedById: superAdmin.id,
            changeReason: 'Initial creation (auto-approved)',
            status: 'ACTIVE',
          },
        });
        await db.approvalTicket.create({
          data: {
            recordId: record.id,
            requestedById: superAdmin.id,
            status: 'PENDING',
            deltaPayload: payloadStr,
          },
        });
      }
    }
    summary.steps.push(
      `Step 4a ARTICLE_MASTER: created ${articlesCreated} records ` +
      `(35 ACTIVE + 8 DRAFT + 5 IN_REVIEW + 2 REVISION_PENDING) with versions & tickets as needed`
    );

    // ── 4b. STORE_MASTER records (12, all ACTIVE) ──────────────
    const storeRecordByCode: Record<string, { id: string; currentPayload: string }> = {};
    for (const seed of STORE_SEEDS) {
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
          status: 'ACTIVE',
          currentPayload: payloadStr,
          version: 1,
          createdById: superAdmin.id,
          updatedById: superAdmin.id,
        },
      });
      storeRecordByCode[seed.code] = { id: record.id, currentPayload: payloadStr };
      storesCreated++;
      // ACTIVE → DataVersion snapshot
      await db.dataVersion.create({
        data: {
          recordId: record.id,
          payloadSnapshot: payloadStr,
          versionNumber: 1,
          changedById: superAdmin.id,
          changeReason: 'Initial creation (auto-approved)',
          status: 'ACTIVE',
        },
      });
    }
    summary.steps.push(`Step 4b STORE_MASTER: created ${storesCreated} ACTIVE records with version snapshots`);

    // ── 4c. SUPPLIER_MASTER records (12: 9 ACTIVE + 2 IN_REVIEW + 1 DRAFT) ──
    for (const seed of SUPPLIER_SEEDS) {
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
      suppliersCreated++;
      if (seed.status === 'ACTIVE') {
        await db.dataVersion.create({
          data: {
            recordId: record.id,
            payloadSnapshot: payloadStr,
            versionNumber: 1,
            changedById: superAdmin.id,
            changeReason: 'Initial creation (auto-approved)',
            status: 'ACTIVE',
          },
        });
      } else if (seed.status === 'IN_REVIEW') {
        await db.approvalTicket.create({
          data: {
            recordId: record.id,
            requestedById: superAdmin.id,
            status: 'PENDING',
            deltaPayload: payloadStr,
          },
        });
      }
      // DRAFT — no version / no ticket
    }
    summary.steps.push(`Step 4c SUPPLIER_MASTER: created ${suppliersCreated} records (9 ACTIVE + 2 IN_REVIEW + 1 DRAFT)`);

    // ── 4d. PRICING_MASTER records (15, all ACTIVE) ────────────
    for (const seed of PRICING_SEEDS) {
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
      pricingsCreated++;
      await db.dataVersion.create({
        data: {
          recordId: record.id,
          payloadSnapshot: payloadStr,
          versionNumber: 1,
          changedById: superAdmin.id,
          changeReason: 'Initial creation (auto-approved)',
          status: 'ACTIVE',
        },
      });
    }
    summary.steps.push(`Step 4d PRICING_MASTER: created ${pricingsCreated} ACTIVE records with version snapshots`);

    // ── 4e. PROMOTION_MASTER records (8: 6 ACTIVE + 1 IN_REVIEW + 1 DRAFT) ──
    for (const seed of PROMOTION_SEEDS) {
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
      promotionsCreated++;
      if (seed.status === 'ACTIVE') {
        await db.dataVersion.create({
          data: {
            recordId: record.id,
            payloadSnapshot: payloadStr,
            versionNumber: 1,
            changedById: superAdmin.id,
            changeReason: 'Initial creation (auto-approved)',
            status: 'ACTIVE',
          },
        });
      } else if (seed.status === 'IN_REVIEW') {
        await db.approvalTicket.create({
          data: {
            recordId: record.id,
            requestedById: superAdmin.id,
            status: 'PENDING',
            deltaPayload: payloadStr,
          },
        });
      }
    }
    summary.steps.push(`Step 4e PROMOTION_MASTER: created ${promotionsCreated} records (6 ACTIVE + 1 IN_REVIEW + 1 DRAFT)`);

    // ============================================================
    // STEP 5: CREATE IMAGEASSET RECORDS
    // (1 primary image per article & per store, from Unsplash URLs)
    // ============================================================
    let imagesCreated = 0;

    // Per-category cycling index (so different articles in the same
    // category get different photos from the pool)
    const categoryPhotoIndex: Record<string, number> = {};
    let storePhotoIndex = 0;

    // 5a. Article images
    for (const seed of ARTICLE_SEEDS) {
      const rec = articleRecordByCode[seed.code];
      if (!rec) continue;
      const pool = photoPoolForCategory(seed.category);
      const idx = categoryPhotoIndex[seed.category] ?? 0;
      const url = pool[idx % pool.length];
      categoryPhotoIndex[seed.category] = idx + 1;
      await db.imageAsset.create({
        data: {
          recordId: rec.id,
          fieldName: 'images',
          fileName: `${seed.code}.jpg`,
          filePath: url,
          fileSize: 0,
          mimeType: 'image/jpeg',
          altText: seed.name,
          sortOrder: 0,
          isPrimary: true,
        },
      });
      imagesCreated++;
    }

    // 5b. Store images
    for (const seed of STORE_SEEDS) {
      const rec = storeRecordByCode[seed.code];
      if (!rec) continue;
      const url = STORE_PHOTOS[storePhotoIndex % STORE_PHOTOS.length];
      storePhotoIndex++;
      await db.imageAsset.create({
        data: {
          recordId: rec.id,
          fieldName: 'store_photos',
          fileName: `${seed.code}.jpg`,
          filePath: url,
          fileSize: 0,
          mimeType: 'image/jpeg',
          altText: seed.name,
          sortOrder: 0,
          isPrimary: true,
        },
      });
      imagesCreated++;
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
