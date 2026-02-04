# Quick Testing Guide - Profit Reports

## URLs to Test

After starting the dev servers, navigate to these URLs:

### Main Menu
- http://localhost:5173/reports/profit - Main profit report menu

### Individual Reports
1. http://localhost:5173/reports/net-profit - Overall business profit
2. http://localhost:5173/reports/items-profit-summary - Profit by item
3. http://localhost:5173/reports/customers-profit-summary - Profit by customer
4. http://localhost:5173/reports/companies-profit-summary - Profit by company
5. http://localhost:5173/reports/date-wise-profit - Profit by date
6. http://localhost:5173/reports/salesman-profit-summary - Profit by salesman

## What to Look For

### Metrics Displayed (8 Total):
1. **Total Sales** - Sum of all invoice amounts (BLUE)
2. **Cost of Sales** - Sum of purchase cost of items sold (ORANGE)
3. **Invoice Profit** - Total Sales minus Cost of Sales (GREEN)
4. **Amount Paid** - Sum of payments received from customers (PURPLE)
5. **Collection Ratio** - Amount Paid ÷ Total Sales as percentage (CYAN)
6. **Outstanding Amount** - Amount not yet paid (RED)
7. **Realized Profit** - Invoice Profit × Collection Ratio (EMERALD) ✨
8. **Unrealized Profit** - Invoice Profit - Realized Profit (YELLOW) ✨

### Key Feature to Test:
The *new* metrics at the bottom (Realized & Unrealized Profit) should:
- Increase/decrease based on payment status
- Show calculation formulas
- Update when customer makes partial payments

## Sample Test Data

If you have existing invoices in the system:
1. Find an invoice where customer hasn't fully paid
2. Navigate to Net Profit report
3. You should see:
   - Realized Profit < Invoice Profit (because of partial payment)
   - Unrealized Profit = remaining profit waiting for payment
   - Outstanding Amount = remaining balance

## Testing Payment Updates

To verify the system works with partial payments:

1. **View Current Status**: Note the realized vs unrealized profit
2. **Make a Payment**: Go to Transactions > Customer Receipt
3. **Enter Details**: 
   - Select the customer
   - Enter partial payment amount
4. **Refresh Reports**: Navigate back to profit reports
5. **Verify Changes**: 
   - Realized Profit should increase
   - Unrealized Profit should decrease
   - Collection Ratio should improve

## API Testing (Alternative)

If you want to test the backend directly using a tool like Postman:

### GET Requests:

```bash
# Net Profit Summary
GET http://localhost:4000/api/reports/profit/net-profit

# All invoices with profit metrics
GET http://localhost:4000/api/reports/profit/summary

# Item-wise profit
GET http://localhost:4000/api/reports/profit/items

# Customer-wise profit
GET http://localhost:4000/api/reports/profit/customers

# Company-wise profit
GET http://localhost:4000/api/reports/profit/companies

# Date-wise profit
GET http://localhost:4000/api/reports/profit/date-wise

# Salesman-wise profit
GET http://localhost:4000/api/reports/profit/salesmen

# Specific invoice profit (replace INV-001 with actual invoice number)
GET http://localhost:4000/api/reports/profit/invoice/INV-001
```

## Expected API Response Format

```json
{
  "total_sales": 10000.00,
  "total_cost": 6000.00,
  "invoice_profit": 4000.00,
  "total_amount_paid": 5000.00,
  "total_outstanding": 5000.00,
  "collection_ratio_percent": 50.00,
  "realized_profit": 2000.00,
  "unrealized_profit": 2000.00
}
```

## Troubleshooting

### No data showing?
- Ensure you have sales invoices with items in the database
- Check that items have purchase_rate values
- Verify customer receipts have been created

### Wrong calculation?
- Check the formulas in the metrics card
- Verify purchase_rate is correct in items master
- Ensure sales transactions have proper cost values

### Missing routes?
- Restart the client dev server (npm run dev --prefix client)
- Clear browser cache
- Check console for any errors

## UI Features to Test

### Sorting:
- Click different sort options to reorder results
- Verify numbers update correctly

### Searching:
- Type in customer/item names
- Verify results filter correctly
- Check that totals update when filtering

### Responsive Design:
- Test on different screen sizes
- Scroll table horizontally on mobile
- Verify card layout adjusts

## Color Coding Reference

The metrics cards use color coding for quick visual identification:

- 🔵 BLUE: Sales figures
- 🟠 ORANGE: Costs
- 🟢 GREEN: Profit amounts
- 🟣 PURPLE: Payments received
- 🔷 CYAN: Percentages/Ratios
- 🔴 RED: Outstanding/Owed
- ✨ EMERALD: Realized Profit (NEW)
- 🟡 YELLOW: Unrealized Profit (NEW)

## Sample Calculations

### Invoice Worth 1000 with 30% Paid:
```
Total Sale       = 1000
Cost            = 600
Invoice Profit  = 400

Amount Paid     = 300
Outstanding     = 700
Collection %    = 30%

Realized Profit = 400 × 30% = 120
Unrealized      = 400 - 120 = 280
```

### Same Invoice After Full Payment:
```
Amount Paid     = 1000
Outstanding     = 0
Collection %    = 100%

Realized Profit = 400 × 100% = 400
Unrealized      = 400 - 400 = 0
```
