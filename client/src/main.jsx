import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "./layout/AppLayout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ErrorPage from "./pages/ErrorPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import CompanyRegistrationPage from "./pages/registration/CompanyRegistrationPage.jsx";
import ItemRegistrationPage from "./pages/registration/ItemRegistrationPage.jsx";
import SupplierRegistrationPage from "./pages/registration/SupplierRegistrationPage.jsx";
import AreaRegistrationPage from "./pages/registration/AreaRegistrationPage.jsx";
import SalesmanRegistrationPage from "./pages/registration/SalesmanRegistrationPage.jsx";
import CustomerRegistrationPage from "./pages/registration/CustomerRegistrationPage.jsx";
import ExpenseRegistrationPage from "./pages/registration/ExpenseRegistrationPage.jsx";
import BankRegistrationPage from "./pages/registration/BankRegistrationPage.jsx";
import RateChangePage from "./pages/registration/RateChangePage.jsx";
import PurchasePage from "./pages/transactions/PurchasePage.jsx";
import SalesPage from "./pages/transactions/SalesPage.jsx";
import SaleReturnPage from "./pages/transactions/SaleReturnPage.jsx";
import PurchaseReturnPage from "./pages/transactions/PurchaseReturnPage.jsx";
import ExpenseEntryPage from "./pages/transactions/ExpenseEntryPage.jsx";
import CustomerReceiptPage from "./pages/transactions/CustomerReceiptPage.jsx";
import SupplierPaymentPage from "./pages/transactions/SupplierPaymentPage.jsx";
import SalesmanReceiptPage from "./pages/transactions/SalesmanReceiptPage.jsx";
import SalesmanBonusPage from "./pages/transactions/SalesmanBonusPage.jsx";
import OrdersPage from "./pages/transactions/OrdersPage.jsx";
import BankTransactionMenuPage from "./pages/transactions/BankTransactionMenuPage.jsx";
import BankTransactionPage from "./pages/transactions/BankTransactionPage.jsx";
import OpeningBalancePage from "./pages/transactions/OpeningBalancePage.jsx";
import BankDepositReportPage from "./pages/reports/BankDepositReportPage.jsx";
import ReceivableCustomerLedgerPage from "./pages/reports/ReceivableCustomerLedgerPage.jsx";
import ReceivableReportMenuPage from "./pages/reports/ReceivableReportMenuPage.jsx";
import ReceivableSummaryPage from "./pages/reports/ReceivableSummaryPage.jsx";
import SalesmanWiseBalancePage from "./pages/reports/SalesmanWiseBalancePage.jsx";
import AreaWiseBalancePage from "./pages/reports/AreaWiseBalancePage.jsx";
import SalesmanAreaWiseBalancePage from "./pages/reports/SalesmanAreaWiseBalancePage.jsx";
import SalesmanCustomerLedgerPage from "./pages/reports/SalesmanCustomerLedgerPage.jsx";
import ExpenseReportPage from "./pages/reports/ExpenseReportPage.jsx";
import EditSalesInvoicePage from "./pages/editing/EditSalesInvoicePage.jsx";
import EditSalesReturnPage from "./pages/editing/EditSalesReturnPage.jsx";
import EditPurchaseInvoicePage from "./pages/editing/EditPurchaseInvoicePage.jsx";
import EditExpenseEntryPage from "./pages/editing/EditExpenseEntryPage.jsx";
import MasterRecordsPage from "./pages/editing/MasterRecordsPage.jsx";
import EditBankTransactionPage from "./pages/editing/EditBankTransactionPage.jsx";
import EditCustomerReceiptPage from "./pages/editing/EditCustomerReceiptPage.jsx";
import EditSupplierPaymentPage from "./pages/editing/EditSupplierPaymentPage.jsx";
import EditDamageTransactionPage from "./pages/editing/EditDamageTransactionPage.jsx";
import TransactionHistoryPage from "./pages/history/TransactionHistoryPage.jsx";
import DamageTransactionPage from "./pages/transactions/DamageTransactionPage.jsx";
import DamageReportPage from "./pages/reports/DamageReportPage.jsx";
import PaymentReportMenuPage from "./pages/reports/PaymentReportMenuPage.jsx";
import SupplierPaymentDateWiseReport from "./pages/reports/SupplierPaymentDateWiseReport.jsx";
import ExpenseWisePaymentReport from "./pages/reports/ExpenseWisePaymentReport.jsx";
import PayableReportMenuPage from "./pages/reports/PayableReportMenuPage.jsx";
import SupplierPayableSummaryPage from "./pages/reports/SupplierPayableSummaryPage.jsx";
import SupplierWiseLedgerPage from "./pages/reports/SupplierWiseLedgerPage.jsx";
import PurchaseReportMenuPage from "./pages/reports/PurchaseReportMenuPage.jsx";
import SupplierBillsSummaryPage from "./pages/reports/SupplierBillsSummaryPage.jsx";
import DaysWisePurchaseSummaryPage from "./pages/reports/DaysWisePurchaseSummaryPage.jsx";
import ItemWisePurchaseDetailPage from "./pages/reports/ItemWisePurchaseDetailPage.jsx";
import ItemCompanyWisePurchaseDetailPage from "./pages/reports/ItemCompanyWisePurchaseDetailPage.jsx";
import CompanyWiseItemPurchaseSummaryPage from "./pages/reports/purchase/CompanyWiseItemPurchaseSummaryPage.jsx";
import DateWiseBillsSummaryPage from "./pages/reports/purchase/DateWiseBillsSummaryPage.jsx";
import BillCheckingPage from "./pages/reports/BillCheckingPage.jsx";
import StockReportMenuPage from "./pages/reports/StockReportMenuPage.jsx";
import CompanyWiseStockCostPage from "./pages/reports/CompanyWiseStockCostPage.jsx";
import CompanyWiseStockTPPage from "./pages/reports/CompanyWiseStockTPPage.jsx";
import ProfitReportMenuPage from "./pages/reports/ProfitReportMenuPage.jsx";
import NetProfitPage from "./pages/reports/NetProfitPage.jsx";
import ItemsProfitSummaryPage from "./pages/reports/ItemsProfitSummaryPage.jsx";
import CustomersProfitSummaryPage from "./pages/reports/CustomersProfitSummaryPage.jsx";
import CompaniesProfitSummaryPage from "./pages/reports/CompaniesProfitSummaryPage.jsx";
import DateWiseProfitPage from "./pages/reports/DateWiseProfitPage.jsx";
import SalesmanProfitSummaryPage from "./pages/reports/SalesmanProfitSummaryPage.jsx";
import SalesmanItemSummaryPage from "./pages/reports/SalesmanItemSummaryPage.jsx";
import SalesReportMenuPage from "./pages/reports/SalesReportMenuPage.jsx";
import CustomerSalesSummaryPage from "./pages/reports/CustomerSalesSummaryPage.jsx";
import DaySalesSummaryPage from "./pages/reports/DaySalesSummaryPage.jsx";
import SalesmanSalesSummaryPage from "./pages/reports/SalesmanSalesSummaryPage.jsx";
import AreaSalesSummaryPage from "./pages/reports/AreaSalesSummaryPage.jsx";
import AreaWiseItemSaleSummaryPage from "./pages/reports/AreaWiseItemSaleSummaryPage.jsx";
import DateWiseDamageOutSummaryPage from "./pages/reports/DateWiseDamageOutSummaryPage.jsx";
import DateWiseDamageInSummaryPage from "./pages/reports/DateWiseDamageInSummaryPage.jsx";
import DateWiseCashCreditSalesPage from "./pages/reports/DateWiseCashCreditSalesPage.jsx";
import ItemWiseSalesDetailPage from "./pages/reports/ItemWiseSalesDetailPage.jsx";
import ItemCustomerWiseSalesPage from "./pages/reports/ItemCustomerWiseSalesPage.jsx";
import AreaCompanySalesSummaryPage from "./pages/reports/AreaCompanySalesSummaryPage.jsx";
import CompanyStatementPage from "./pages/reports/CompanyStatementPage.jsx";
import CompanyEntireAreaSalesPage from "./pages/reports/CompanyEntireAreaSalesPage.jsx";
import CompanyPercentageDetailsPage from "./pages/reports/CompanyPercentageDetailsPage.jsx";
import DateWiseItemsSummaryPage from "./pages/reports/DateWiseItemsSummaryPage.jsx";
import UserManagementPage from "./pages/management/UserManagementPage.jsx";
import SalesmanManagementPage from "./pages/management/SalesmanManagementPage.jsx";
import SalesmanApprovalsPage from "./pages/management/SalesmanApprovalsPage.jsx";
import CancelInvoicePage from "./pages/registration/CancelInvoicePage.jsx";
import "./index.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        errorElement: <ErrorPage />,
        children: [
      { index: true, element: <Dashboard /> },
      { path: "registration", element: <Navigate to="/master/company" replace /> },
      { path: "master/company", element: <CompanyRegistrationPage /> },
      { path: "master/item", element: <ItemRegistrationPage /> },
      { path: "master/supplier", element: <SupplierRegistrationPage /> },
      { path: "master/area", element: <AreaRegistrationPage /> },
      { path: "master/salesman", element: <SalesmanRegistrationPage /> },
      { path: "master/customer", element: <CustomerRegistrationPage /> },
      { path: "master/expense", element: <ExpenseRegistrationPage /> },
      { path: "master/bank", element: <BankRegistrationPage /> },
      { path: "master/rate-change", element: <RateChangePage /> },
      { path: "master/cancel-invoice", element: <CancelInvoicePage /> },
      { path: "transactions/purchase", element: <PurchasePage /> },
      { path: "transactions/sales", element: <SalesPage /> },
      { path: "transactions/orders", element: <OrdersPage /> },
      { path: "transactions/sale-return", element: <SaleReturnPage /> },
      { path: "transactions/purchase-return", element: <PurchaseReturnPage /> },
      { path: "transactions/expense-entry", element: <ExpenseEntryPage /> },
      { path: "transactions/customer-receipt", element: <CustomerReceiptPage /> },
      { path: "transactions/supplier-payment", element: <SupplierPaymentPage /> },
      { path: "transactions/opening-balance", element: <OpeningBalancePage /> },
      { path: "transactions/salesman-receipt", element: <SalesmanReceiptPage /> },
      { path: "transactions/salesman-bonus", element: <Navigate to="/management/salesman-bonus" replace /> },
      { path: "transactions/bank", element: <BankTransactionMenuPage /> },
      { path: "transactions/bank/:mode", element: <BankTransactionPage /> },
      { path: "transactions/damage", element: <DamageTransactionPage /> },
      { path: "history/transactions", element: <TransactionHistoryPage /> },
      { path: "reports/receivables", element: <ReceivableReportMenuPage /> },
      { path: "reports/receivables/summary", element: <ReceivableSummaryPage /> },
      { path: "reports/receivables/salesman-wise-balance", element: <SalesmanWiseBalancePage /> },
      { path: "reports/receivables/area-wise-balance", element: <AreaWiseBalancePage /> },
      { path: "reports/receivables/salesman-area-wise-balance", element: <SalesmanAreaWiseBalancePage /> },
      { path: "reports/receivables/salesman-customer-ledger", element: <SalesmanCustomerLedgerPage /> },
      { path: "reports/receivables/customer-ledger", element: <ReceivableCustomerLedgerPage /> },
      { path: "reports/bank-deposits", element: <BankDepositReportPage /> },
      { path: "reports/damage", element: <DamageReportPage /> },
      { path: "reports/stock", element: <StockReportMenuPage /> },
      { path: "reports/stock/company-wise-cost", element: <CompanyWiseStockCostPage /> },
      { path: "reports/stock/company-wise-tp", element: <CompanyWiseStockTPPage /> },
      { path: "reports/profit", element: <ProfitReportMenuPage /> },
      { path: "reports/net-profit", element: <NetProfitPage /> },
      { path: "reports/items-profit-summary", element: <ItemsProfitSummaryPage /> },
      { path: "reports/customers-profit-summary", element: <CustomersProfitSummaryPage /> },
      { path: "reports/companies-profit-summary", element: <CompaniesProfitSummaryPage /> },
      { path: "reports/date-wise-profit", element: <DateWiseProfitPage /> },
      { path: "reports/salesman-profit-summary", element: <SalesmanProfitSummaryPage /> },
      { path: "reports/sales", element: <SalesReportMenuPage /> },
      { path: "reports/sales/customer-summary", element: <CustomerSalesSummaryPage /> },
      { path: "reports/sales/day-summary", element: <DaySalesSummaryPage /> },
      { path: "reports/sales/salesman-summary", element: <SalesmanSalesSummaryPage /> },
      { path: "reports/sales/area-summary", element: <AreaSalesSummaryPage /> },
      { path: "reports/sales/area-wise-item-summary", element: <AreaWiseItemSaleSummaryPage /> },
      { path: "reports/sales/date-wise-damage-out", element: <DateWiseDamageOutSummaryPage /> },
      { path: "reports/sales/date-wise-damage-in", element: <DateWiseDamageInSummaryPage /> },
      { path: "reports/sales/cash-credit", element: <DateWiseCashCreditSalesPage /> },
      { path: "reports/sales/date-items-summary", element: <DateWiseItemsSummaryPage /> },
      { path: "reports/sales/item-detail", element: <ItemWiseSalesDetailPage /> },
      { path: "reports/sales/item-customer", element: <ItemCustomerWiseSalesPage /> },
      { path: "reports/sales/company-entire-area", element: <CompanyEntireAreaSalesPage /> },
      { path: "reports/sales/area-company", element: <AreaCompanySalesSummaryPage /> },
      { path: "reports/sales/company-statement", element: <CompanyStatementPage /> },
      { path: "reports/sales/company-percentage-details", element: <CompanyPercentageDetailsPage /> },
      { path: "reports/salesman/items-summary", element: <SalesmanItemSummaryPage /> },
      { path: "reports/payment", element: <PaymentReportMenuPage /> },
      { path: "reports/payment/supplier-date-wise", element: <SupplierPaymentDateWiseReport /> },
      { path: "reports/payment/expense-report", element: <ExpenseReportPage /> },
      { path: "reports/payable", element: <PayableReportMenuPage /> },
      { path: "reports/payable/supplier-summary", element: <SupplierPayableSummaryPage /> },
      { path: "reports/payable/supplier-ledger", element: <SupplierWiseLedgerPage /> },
      { path: "reports/purchase", element: <PurchaseReportMenuPage /> },
      { path: "reports/purchase/supplier-bills-summary", element: <SupplierBillsSummaryPage /> },
      { path: "reports/purchase/days-wise-summary", element: <DaysWisePurchaseSummaryPage /> },
      { path: "reports/purchase/date-wise-bills-summary", element: <DateWiseBillsSummaryPage /> },
      { path: "reports/purchase/bill-checking", element: <BillCheckingPage /> },
      { path: "reports/purchase/item-wise-detail", element: <ItemWisePurchaseDetailPage /> },
      { path: "reports/purchase/item-company-wise-detail", element: <ItemCompanyWisePurchaseDetailPage /> },
      { path: "reports/purchase/company-wise-item-summary", element: <CompanyWiseItemPurchaseSummaryPage /> },
      { path: "editing/sales", element: <EditSalesInvoicePage /> },
      { path: "editing/sales-return", element: <EditSalesReturnPage /> },
      { path: "editing/purchase", element: <EditPurchaseInvoicePage /> },
      { path: "editing/expense-entry", element: <EditExpenseEntryPage /> },
      { path: "editing/master-records", element: <MasterRecordsPage /> },
      { path: "editing/bank-transaction", element: <EditBankTransactionPage /> },
      { path: "editing/customer-receipt", element: <EditCustomerReceiptPage /> },
      { path: "editing/supplier-payment", element: <EditSupplierPaymentPage /> },
      { path: "editing/damage", element: <EditDamageTransactionPage /> },
          { path: "management/users", element: <UserManagementPage /> },
          { path: "management/salesmen", element: <SalesmanManagementPage /> },
          { path: "management/salesman-approvals", element: <SalesmanApprovalsPage /> },
          { path: "management/salesman-bonus", element: <SalesmanBonusPage /> },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
