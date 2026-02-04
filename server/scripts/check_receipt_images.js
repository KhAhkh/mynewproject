import { getDb } from "../src/database.js";

const db = getDb();

console.log("\n=== Checking Customer Receipts with Images ===\n");

// Check if attachment_image column exists
const tableInfo = db.prepare("PRAGMA table_info(customer_receipts)").all();
const hasAttachmentColumn = tableInfo.some(col => col.name === 'attachment_image');

console.log(`attachment_image column exists: ${hasAttachmentColumn}`);

if (!hasAttachmentColumn) {
  console.log("\n❌ ERROR: attachment_image column is missing from customer_receipts table!");
  console.log("\nTable columns:");
  tableInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  process.exit(1);
}

// Check for receipts with images
const receiptsWithImages = db.prepare(`
  SELECT receipt_no, customer_id, amount, payment_mode, 
         CASE WHEN attachment_image IS NULL THEN 'NO' ELSE 'YES' END as has_image,
         LENGTH(attachment_image) as image_size
  FROM customer_receipts
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log(`\nRecent receipts (last 10):`);
receiptsWithImages.forEach(r => {
  console.log(`  Receipt: ${r.receipt_no}, Amount: ${r.amount}, Mode: ${r.payment_mode}, Has Image: ${r.has_image}, Size: ${r.image_size || 0} bytes`);
});

const totalWithImages = db.prepare(`
  SELECT COUNT(*) as count FROM customer_receipts WHERE attachment_image IS NOT NULL
`).get();

console.log(`\n✓ Total receipts with images: ${totalWithImages.count}`);

// Show a sample receipt detail
const sampleReceipt = db.prepare(`
  SELECT receipt_no, attachment_image FROM customer_receipts 
  WHERE attachment_image IS NOT NULL 
  LIMIT 1
`).get();

if (sampleReceipt) {
  console.log(`\nSample receipt with image:`);
  console.log(`  Receipt No: ${sampleReceipt.receipt_no}`);
  const imagePreview = sampleReceipt.attachment_image ? 
    sampleReceipt.attachment_image.substring(0, 50) + '...' : 
    'null';
  console.log(`  Image data (first 50 chars): ${imagePreview}`);
}

console.log("\n");
