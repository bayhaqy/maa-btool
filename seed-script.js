const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  
  let mapgroup = await prisma.tenantCompany.findFirst({ where: { companyCode: 'MAPGROUP' } });
  if (!mapgroup) {
    mapgroup = await prisma.tenantCompany.create({
      data: { companyCode: 'MAPGROUP', companyName: 'MAP Group', description: 'MAP Active Alliance', industry: 'Retail', tenantTier: 'ENTERPRISE', onboardingStatus: 'ACTIVE' }
    });
  }
  const companyId = mapgroup.id;
  
  // ─── Modules ───
  const moduleDefs = [
    { moduleCode: 'ARTICLE_MASTER', moduleName: 'Article Master', moduleIcon: 'Package', sortOrder: 1, description: 'Product articles & SKUs', entityType: 'PRODUCT' },
    { moduleCode: 'STORE_MASTER', moduleName: 'Store Master', moduleIcon: 'Store', sortOrder: 2, description: 'Store locations & details', entityType: 'LOCATION' },
    { moduleCode: 'SUPPLIER_MASTER', moduleName: 'Supplier Master', moduleIcon: 'Truck', sortOrder: 3, description: 'Supplier information', entityType: 'SUPPLIER' },
    { moduleCode: 'PRICING_MASTER', moduleName: 'Pricing Master', moduleIcon: 'DollarSign', sortOrder: 4, description: 'Pricing & discounts', entityType: 'PRODUCT' },
    { moduleCode: 'PROMOTION_MASTER', moduleName: 'Promotion Master', moduleIcon: 'Tag', sortOrder: 5, description: 'Promotions & campaigns', entityType: 'PRODUCT' },
    { moduleCode: 'CUSTOMER_MASTER', moduleName: 'Customer Master', moduleIcon: 'Users', sortOrder: 6, description: 'Customer profiles', entityType: 'CUSTOMER' },
    { moduleCode: 'BRAND_MASTER', moduleName: 'Brand Master', moduleIcon: 'Award', sortOrder: 7, description: 'Brand information', entityType: 'PRODUCT' },
    { moduleCode: 'CATEGORY_MASTER', moduleName: 'Category Master', moduleIcon: 'Layers', sortOrder: 8, description: 'Product categories', entityType: 'PRODUCT' },
    { moduleCode: 'INVENTORY_MASTER', moduleName: 'Inventory Master', moduleIcon: 'Archive', sortOrder: 9, description: 'Stock & inventory', entityType: 'PRODUCT' },
    { moduleCode: 'EMPLOYEE_MASTER', moduleName: 'Employee Master', moduleIcon: 'UserCheck', sortOrder: 10, description: 'Employee records', entityType: 'ASSET' },
    { moduleCode: 'BUDGET_MASTER', moduleName: 'Budget Master', moduleIcon: 'Calculator', sortOrder: 11, description: 'Budget planning', entityType: 'PRODUCT' },
    { moduleCode: 'ASSET_MASTER', moduleName: 'Asset Master', moduleIcon: 'Building', sortOrder: 12, description: 'Asset tracking', entityType: 'ASSET' },
  ];
  
  const moduleMap = {};
  for (const m of moduleDefs) {
    let mod = await prisma.metaModule.findFirst({ where: { moduleCode: m.moduleCode } });
    if (!mod) {
      mod = await prisma.metaModule.create({ data: { ...m, isActive: true, requireApproval: true } });
    }
    moduleMap[m.moduleCode] = mod.id;
  }
  console.log('Modules: ' + Object.keys(moduleMap).length);
  
  // ─── Meta Fields ───
  const fieldDefs = {
    'ARTICLE_MASTER': [
      { fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'generic_article_code', fieldName: 'Generic Article Code', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'article_name', fieldName: 'Article Name', dataType: 'TEXT', isRequired: true, sortOrder: 3 },
      { fieldCode: 'brand', fieldName: 'Brand', dataType: 'SELECT', sortOrder: 4 },
      { fieldCode: 'category', fieldName: 'Category', dataType: 'SELECT', sortOrder: 5 },
      { fieldCode: 'sub_category', fieldName: 'Sub Category', dataType: 'SELECT', cascadesFromFieldCode: 'category', sortOrder: 6 },
      { fieldCode: 'color', fieldName: 'Color', dataType: 'SELECT', sortOrder: 7 },
      { fieldCode: 'size', fieldName: 'Size', dataType: 'SELECT', sortOrder: 8 },
      { fieldCode: 'description', fieldName: 'Description', dataType: 'LONG_TEXT', sortOrder: 9 },
      { fieldCode: 'source_url', fieldName: 'Source URL', dataType: 'URL', sortOrder: 10 },
      { fieldCode: 'image_url', fieldName: 'Image URL', dataType: 'URL', sortOrder: 11 },
      { fieldCode: 'retail_price', fieldName: 'Retail Price', dataType: 'CURRENCY', sortOrder: 12 },
    ],
    'STORE_MASTER': [
      { fieldCode: 'store_code', fieldName: 'Store Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'store_name', fieldName: 'Store Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'region', fieldName: 'Region', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'store_type', fieldName: 'Store Type', dataType: 'SELECT', sortOrder: 4 },
      { fieldCode: 'address', fieldName: 'Address', dataType: 'TEXT', sortOrder: 5 },
      { fieldCode: 'phone', fieldName: 'Phone', dataType: 'PHONE', sortOrder: 6 },
    ],
    'CUSTOMER_MASTER': [
      { fieldCode: 'customer_code', fieldName: 'Customer Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'customer_name', fieldName: 'Customer Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'email', fieldName: 'Email', dataType: 'EMAIL', isRequired: true, sortOrder: 3 },
      { fieldCode: 'membership_tier', fieldName: 'Membership Tier', dataType: 'SELECT', sortOrder: 4 },
      { fieldCode: 'total_spent', fieldName: 'Total Spent', dataType: 'CURRENCY', sortOrder: 5 },
    ],
    'SUPPLIER_MASTER': [
      { fieldCode: 'supplier_code', fieldName: 'Supplier Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'supplier_name', fieldName: 'Supplier Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'supplier_type', fieldName: 'Type', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'country', fieldName: 'Country', dataType: 'TEXT', sortOrder: 4 },
    ],
    'PRICING_MASTER': [
      { fieldCode: 'price_code', fieldName: 'Price Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'price_type', fieldName: 'Price Type', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'amount', fieldName: 'Amount', dataType: 'CURRENCY', isRequired: true, sortOrder: 4 },
      { fieldCode: 'currency', fieldName: 'Currency', dataType: 'SELECT', sortOrder: 5 },
    ],
    'PROMOTION_MASTER': [
      { fieldCode: 'promo_code', fieldName: 'Promo Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'promo_name', fieldName: 'Promo Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'promo_type', fieldName: 'Promo Type', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'discount_value', fieldName: 'Discount Value', dataType: 'NUMBER', sortOrder: 4 },
    ],
    'BRAND_MASTER': [
      { fieldCode: 'brand_code', fieldName: 'Brand Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'brand_name', fieldName: 'Brand Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
    ],
    'CATEGORY_MASTER': [
      { fieldCode: 'category_code', fieldName: 'Category Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'category_name', fieldName: 'Category Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
    ],
    'INVENTORY_MASTER': [
      { fieldCode: 'inventory_code', fieldName: 'Inventory Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'article_code', fieldName: 'Article Code', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'warehouse', fieldName: 'Warehouse', dataType: 'TEXT', isRequired: true, sortOrder: 3 },
      { fieldCode: 'quantity_on_hand', fieldName: 'Qty On Hand', dataType: 'INTEGER', isRequired: true, sortOrder: 4 },
    ],
    'EMPLOYEE_MASTER': [
      { fieldCode: 'employee_code', fieldName: 'Employee Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'employee_name', fieldName: 'Employee Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'department', fieldName: 'Department', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'position', fieldName: 'Position', dataType: 'TEXT', sortOrder: 4 },
    ],
    'BUDGET_MASTER': [
      { fieldCode: 'budget_code', fieldName: 'Budget Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'department', fieldName: 'Department', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'allocated', fieldName: 'Allocated', dataType: 'CURRENCY', isRequired: true, sortOrder: 3 },
      { fieldCode: 'spent', fieldName: 'Spent', dataType: 'CURRENCY', sortOrder: 4 },
    ],
    'ASSET_MASTER': [
      { fieldCode: 'asset_code', fieldName: 'Asset Code', dataType: 'TEXT', isRequired: true, isUnique: true, sortOrder: 1 },
      { fieldCode: 'asset_name', fieldName: 'Asset Name', dataType: 'TEXT', isRequired: true, sortOrder: 2 },
      { fieldCode: 'asset_type', fieldName: 'Type', dataType: 'SELECT', sortOrder: 3 },
      { fieldCode: 'condition', fieldName: 'Condition', dataType: 'SELECT', sortOrder: 4 },
    ],
  };
  
  let totalFields = 0;
  for (const [modCode, fields] of Object.entries(fieldDefs)) {
    for (const f of fields) {
      const existing = await prisma.metaField.findFirst({ where: { fieldCode: f.fieldCode, moduleId: moduleMap[modCode] } });
      if (!existing) {
        await prisma.metaField.create({ data: { ...f, moduleId: moduleMap[modCode], isActive: true } });
        totalFields++;
      }
    }
  }
  console.log('Fields created: ' + totalFields);
  
  // ─── Lookups ───
  const lookupDefs = {
    'CATEGORY': ['Footwear', 'Apparel', 'Accessories', 'Equipment', 'Bags'],
    'SUB_CATEGORY': ['Running Shoes', 'Casual Shoes', 'Sneakers', 'T-Shirt', 'Jacket', 'Shorts', 'Hoodie', 'Cap', 'Backpack', 'Socks'],
    'BRAND': ['Nike', 'Adidas', 'Puma', 'Converse', 'Vans', 'New Balance', 'Reebok', 'Under Armour', 'ASICS', 'Fila', 'Skechers', 'Hoka'],
    'COLOR': ['Black', 'White', 'Red', 'Blue', 'Green', 'Grey', 'Pink', 'Orange', 'Coral', 'Navy'],
    'SIZE_SHOES': ['38', '39', '40', '41', '42', '43', '44', '45'],
    'SIZE_APPAREL': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'REGION': ['Java', 'Sumatra', 'Bali', 'Kalimantan', 'Sulawesi'],
    'STORE_TYPE': ['Flagship', 'Outlet', 'Pop-up', 'Department Store', 'Online'],
    'DEPARTMENT': ['Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'IT'],
    'CURRENCY': ['IDR', 'USD', 'SGD'],
    'PRICE_TYPE': ['Regular', 'Promotional', 'Wholesale', 'Cost'],
    'PROMO_TYPE': ['Flash Sale', 'BOGO', 'Bundle Deal', 'Loyalty Reward'],
    'DISCOUNT_TYPE': ['Percentage', 'Fixed Amount'],
    'MEMBERSHIP_TIER': ['Bronze', 'Silver', 'Gold', 'Platinum'],
    'SUPPLIER_TYPE': ['Manufacturer', 'Distributor', 'Wholesaler'],
    'PAYMENT_TERMS': ['Net 30', 'Net 60', 'Net 90', 'COD'],
    'ASSET_TYPE': ['Vehicle', 'IT Equipment', 'Furniture', 'Machinery'],
    'ASSET_CONDITION': ['New', 'Good', 'Fair', 'Poor', 'Retired'],
    'BUDGET_STATUS': ['Draft', 'Approved', 'Active', 'Closed'],
    'EMPLOYEE_STATUS': ['Active', 'On Leave', 'Probation'],
    'GENDER': ['Male', 'Female', 'Unisex'],
  };
  
  const lookupMap = {};
  for (const [code, values] of Object.entries(lookupDefs)) {
    let master = await prisma.lookupMaster.findFirst({ where: { lookupCode: code } });
    if (!master) {
      master = await prisma.lookupMaster.create({ data: { lookupCode: code, lookupName: code.replace(/_/g, ' '), isActive: true } });
    }
    lookupMap[code] = master.id;
    for (let i = 0; i < values.length; i++) {
      const vc = values[i].toUpperCase().replace(/ /g, '_');
      const existing = await prisma.lookupValue.findFirst({ where: { lookupId: master.id, valueCode: vc } });
      if (!existing) {
        await prisma.lookupValue.create({ data: { lookupId: master.id, valueCode: vc, displayValue: values[i], sortOrder: i + 1, isActive: true } });
      }
    }
  }
  console.log('Lookups: ' + Object.keys(lookupMap).length);
  
  // ─── Role Permissions ───
  const saRole = await prisma.sysRole.findFirst({ where: { roleName: 'System Administrator', companyId } });
  if (saRole) {
    let permCount = 0;
    for (const [modCode, modId] of Object.entries(moduleMap)) {
      const existing = await prisma.rolePermission.findFirst({ where: { roleId: saRole.id, moduleId: modId } });
      if (!existing) {
        await prisma.rolePermission.create({
          data: { roleId: saRole.id, moduleId: modId, canRead: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true, canImport: true, canBulkUpdate: true }
        });
        permCount++;
      }
    }
    console.log('Role permissions: ' + permCount);
  }
  
  // ─── Hierarchy ───
  let catHierarchy = await prisma.hierarchyModel.findFirst({ where: { hierarchyName: 'Product Category' } });
  if (!catHierarchy) {
    catHierarchy = await prisma.hierarchyModel.create({
      data: { hierarchyName: 'Product Category', description: 'Product category hierarchy', hierarchyType: 'CLASSIFICATION', moduleId: moduleMap['CATEGORY_MASTER'] }
    });
    const roots = [
      { name: 'Footwear', children: ['Running Shoes', 'Casual Shoes', 'Sneakers', 'Sandals'] },
      { name: 'Apparel', children: ['T-Shirt', 'Jacket', 'Shorts', 'Hoodie'] },
      { name: 'Accessories', children: ['Cap', 'Backpack', 'Socks', 'Belt'] },
    ];
    for (const root of roots) {
      const parentNode = await prisma.hierarchyNode.create({
        data: { hierarchyId: catHierarchy.id, nodeLabel: root.name, depthLevel: 0, sortOrder: 0 }
      });
      for (let i = 0; i < root.children.length; i++) {
        await prisma.hierarchyNode.create({
          data: { hierarchyId: catHierarchy.id, parentNodeId: parentNode.id, nodeLabel: root.children[i], depthLevel: 1, sortOrder: i }
        });
      }
    }
    console.log('Hierarchy: Product Category created');
  }
  
  // ─── App Settings ───
  const settings = [
    { settingKey: 'AI_PROVIDER', settingValue: 'glm-5.1' },
    { settingKey: 'AI_API_KEY', settingValue: '' },
    { settingKey: 'AI_MODEL', settingValue: 'glm-5.1' },
  ];
  for (const s of settings) {
    const existing = await prisma.appSettings.findFirst({ where: { settingKey: s.settingKey } });
    if (!existing) {
      await prisma.appSettings.create({ data: s });
    }
  }
  console.log('App Settings: 3');
  
  // ─── Data Records ───
  // DataRecord uses currentPayload (JSON string), no recordCode or moduleName
  
  const dataDefs = [
    // Articles
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414929-A048-40', generic_article_code: 'SP260407414929-A048', article_name: "Nike Pegasus 42 Women's Road Running Shoes", brand: 'Nike', category: 'Footwear', sub_category: 'Running Shoes', color: 'Coral', size: '40', description: 'Responsive road running shoes for women', retail_price: 1899000, source_url: 'https://www.mapclub.com/item/planet-sports/nike/nike-pegasus-42-women-s-road-running-shoes-coral-SP260407414929-A048' }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414929-A048-41', generic_article_code: 'SP260407414929-A048', article_name: "Nike Pegasus 42 Women's Road Running Shoes", brand: 'Nike', category: 'Footwear', sub_category: 'Running Shoes', color: 'Coral', size: '41', description: 'Responsive road running shoes for women', retail_price: 1899000 }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414929-A048-42', generic_article_code: 'SP260407414929-A048', article_name: "Nike Pegasus 42 Women's Road Running Shoes", brand: 'Nike', category: 'Footwear', sub_category: 'Running Shoes', color: 'Coral', size: '42', description: 'Responsive road running shoes for women', retail_price: 1899000 }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414930-B012-42', generic_article_code: 'SP260407414930-B012', article_name: "Adidas Ultraboost 24 Men's Running Shoes", brand: 'Adidas', category: 'Footwear', sub_category: 'Running Shoes', color: 'Black', size: '42', description: 'Premium running shoes with Boost technology', retail_price: 2899000 }, brand: 'Adidas', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414930-B012-43', generic_article_code: 'SP260407414930-B012', article_name: "Adidas Ultraboost 24 Men's Running Shoes", brand: 'Adidas', category: 'Footwear', sub_category: 'Running Shoes', color: 'Black', size: '43', description: 'Premium running shoes with Boost technology', retail_price: 2899000 }, brand: 'Adidas', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414931-C005-41', generic_article_code: 'SP260407414931-C005', article_name: 'Puma RS-X3 Puzzle Sneakers', brand: 'Puma', category: 'Footwear', sub_category: 'Sneakers', color: 'White', size: '41', description: 'Retro-inspired chunky sneakers', retail_price: 1599000 }, brand: 'Puma', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414932-D018-M', generic_article_code: 'SP260407414932-D018', article_name: 'Nike Dri-FIT Running T-Shirt', brand: 'Nike', category: 'Apparel', sub_category: 'T-Shirt', color: 'Blue', size: 'M', description: 'Moisture-wicking running t-shirt', retail_price: 599000 }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414932-D018-L', generic_article_code: 'SP260407414932-D018', article_name: 'Nike Dri-FIT Running T-Shirt', brand: 'Nike', category: 'Apparel', sub_category: 'T-Shirt', color: 'Blue', size: 'L', description: 'Moisture-wicking running t-shirt', retail_price: 599000 }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414933-E022-L', generic_article_code: 'SP260407414933-E022', article_name: 'Adidas Terrex Hiking Jacket', brand: 'Adidas', category: 'Apparel', sub_category: 'Jacket', color: 'Green', size: 'L', description: 'Waterproof hiking jacket', retail_price: 2499000 }, brand: 'Adidas', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414934-F030-OS', generic_article_code: 'SP260407414934-F030', article_name: 'New Balance Running Cap', brand: 'New Balance', category: 'Accessories', sub_category: 'Cap', color: 'Black', size: 'One Size', description: 'Lightweight running cap', retail_price: 349000 }, brand: 'New Balance', status: 'PUBLISHED' },
    { modCode: 'ARTICLE_MASTER', payload: { article_code: 'SP260407414935-G015-OS', generic_article_code: 'SP260407414935-G015', article_name: 'Nike Heritage Backpack', brand: 'Nike', category: 'Accessories', sub_category: 'Backpack', color: 'Grey', size: 'One Size', description: 'Spacious lifestyle backpack', retail_price: 799000 }, brand: 'Nike', status: 'PUBLISHED' },
    // Stores
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-JKT-001', store_name: 'Planet Sports Grand Indonesia', region: 'Java', store_type: 'Flagship', address: 'Grand Indonesia Mall, Jakarta', phone: '+62-21-5555-001' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-JKT-002', store_name: 'Planet Sports Pondok Indah Mall', region: 'Java', store_type: 'Department Store', address: 'Pondok Indah Mall, Jakarta', phone: '+62-21-5555-002' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-BND-001', store_name: 'Sports Station Bandung', region: 'Java', store_type: 'Outlet', address: 'Paris Van Java Mall, Bandung', phone: '+62-22-5555-001' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-SBY-001', store_name: 'Planet Sports Tunjungan Plaza', region: 'Java', store_type: 'Department Store', address: 'Tunjungan Plaza, Surabaya', phone: '+62-31-5555-001' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-BLI-001', store_name: 'Sports Station Beachwalk Bali', region: 'Bali', store_type: 'Flagship', address: 'Beachwalk Mall, Kuta, Bali', phone: '+62-361-555-001' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-MDN-001', store_name: 'Planet Sports Sun Plaza Medan', region: 'Sumatra', store_type: 'Department Store', address: 'Sun Plaza, Medan', phone: '+62-61-555-001' }, status: 'PUBLISHED' },
    { modCode: 'STORE_MASTER', payload: { store_code: 'STR-ONL-001', store_name: 'MapClub Online Store', region: 'Java', store_type: 'Online', address: 'https://www.mapclub.com', phone: '+62-21-5555-000' }, status: 'PUBLISHED' },
    // Suppliers
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-NIKE-01', supplier_name: 'Nike Indonesia', supplier_type: 'Manufacturer', country: 'Indonesia' }, status: 'PUBLISHED' },
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-ADID-01', supplier_name: 'Adidas Southeast Asia', supplier_type: 'Distributor', country: 'Singapore' }, status: 'PUBLISHED' },
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-PUMA-01', supplier_name: 'Puma Indonesia', supplier_type: 'Distributor', country: 'Indonesia' }, status: 'PUBLISHED' },
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-CONV-01', supplier_name: 'Converse Asia Pacific', supplier_type: 'Distributor', country: 'Hong Kong' }, status: 'PUBLISHED' },
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-VANS-01', supplier_name: 'Vans Indonesia', supplier_type: 'Distributor', country: 'Indonesia' }, status: 'PUBLISHED' },
    { modCode: 'SUPPLIER_MASTER', payload: { supplier_code: 'SUP-NB-01', supplier_name: 'New Balance Indonesia', supplier_type: 'Manufacturer', country: 'Indonesia' }, status: 'PUBLISHED' },
    // Customers
    { modCode: 'CUSTOMER_MASTER', payload: { customer_code: 'CUS-001', customer_name: 'Budi Santoso', email: 'budi@email.com', membership_tier: 'Gold', total_spent: 15000000 }, status: 'PUBLISHED' },
    { modCode: 'CUSTOMER_MASTER', payload: { customer_code: 'CUS-002', customer_name: 'Siti Rahayu', email: 'siti@email.com', membership_tier: 'Platinum', total_spent: 35000000 }, status: 'PUBLISHED' },
    { modCode: 'CUSTOMER_MASTER', payload: { customer_code: 'CUS-003', customer_name: 'Ahmad Hidayat', email: 'ahmad@email.com', membership_tier: 'Silver', total_spent: 5000000 }, status: 'PUBLISHED' },
    { modCode: 'CUSTOMER_MASTER', payload: { customer_code: 'CUS-004', customer_name: 'Dewi Lestari', email: 'dewi@email.com', membership_tier: 'Gold', total_spent: 12000000 }, status: 'PUBLISHED' },
    { modCode: 'CUSTOMER_MASTER', payload: { customer_code: 'CUS-005', customer_name: 'Rizky Pratama', email: 'rizky@email.com', membership_tier: 'Bronze', total_spent: 2000000 }, status: 'PUBLISHED' },
    // Pricing
    { modCode: 'PRICING_MASTER', payload: { price_code: 'PRC-001', article_code: 'SP260407414929-A048-40', price_type: 'Regular', amount: 1899000, currency: 'IDR' }, status: 'PUBLISHED' },
    { modCode: 'PRICING_MASTER', payload: { price_code: 'PRC-002', article_code: 'SP260407414930-B012-42', price_type: 'Regular', amount: 2899000, currency: 'IDR' }, status: 'PUBLISHED' },
    { modCode: 'PRICING_MASTER', payload: { price_code: 'PRC-003', article_code: 'SP260407414931-C005-41', price_type: 'Promotional', amount: 1279000, currency: 'IDR' }, status: 'PUBLISHED' },
    // Promotions
    { modCode: 'PROMOTION_MASTER', payload: { promo_code: 'PRM-001', promo_name: 'Summer Flash Sale 2026', promo_type: 'Flash Sale', discount_value: 30 }, status: 'PUBLISHED' },
    { modCode: 'PROMOTION_MASTER', payload: { promo_code: 'PRM-002', promo_name: 'Buy 1 Get 1 Sneakers', promo_type: 'BOGO', discount_value: 50 }, status: 'PUBLISHED' },
    // Inventory
    { modCode: 'INVENTORY_MASTER', payload: { inventory_code: 'INV-001', article_code: 'SP260407414929-A048-40', warehouse: 'Jakarta Central', quantity_on_hand: 150 }, status: 'PUBLISHED' },
    { modCode: 'INVENTORY_MASTER', payload: { inventory_code: 'INV-002', article_code: 'SP260407414930-B012-42', warehouse: 'Jakarta Central', quantity_on_hand: 75 }, status: 'PUBLISHED' },
    { modCode: 'INVENTORY_MASTER', payload: { inventory_code: 'INV-003', article_code: 'SP260407414931-C005-41', warehouse: 'Bandung DC', quantity_on_hand: 200 }, status: 'PUBLISHED' },
    // Brands
    { modCode: 'BRAND_MASTER', payload: { brand_code: 'BRD-NIKE', brand_name: 'Nike' }, brand: 'Nike', status: 'PUBLISHED' },
    { modCode: 'BRAND_MASTER', payload: { brand_code: 'BRD-ADID', brand_name: 'Adidas' }, brand: 'Adidas', status: 'PUBLISHED' },
    { modCode: 'BRAND_MASTER', payload: { brand_code: 'BRD-PUMA', brand_name: 'Puma' }, brand: 'Puma', status: 'PUBLISHED' },
  ];
  
  let recordCount = 0;
  for (const d of dataDefs) {
    const payloadStr = JSON.stringify(d.payload);
    // Check if record already exists (by matching payload content)
    const existingCount = await prisma.dataRecord.count({ where: { moduleId: moduleMap[d.modCode], companyId, currentPayload: payloadStr } });
    if (existingCount === 0) {
      await prisma.dataRecord.create({
        data: {
          moduleId: moduleMap[d.modCode],
          companyId,
          status: d.status || 'PUBLISHED',
          currentPayload: payloadStr,
          brand: d.brand || null,
          version: 1,
          qualityScore: 85,
          completenessScore: 90,
        }
      });
      recordCount++;
    }
  }
  console.log('Data Records: ' + recordCount);
  
  console.log('\\nAll seed data complete!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
