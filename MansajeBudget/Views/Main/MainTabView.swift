import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var dashboardVM = DashboardViewModel()
    @StateObject private var transactionsVM = TransactionsViewModel()
    @StateObject private var budgetVM = BudgetViewModel()
    @StateObject private var accountsVM = AccountsViewModel()
    @StateObject private var reportsVM = ReportsViewModel()

    @State private var selectedTab = 0

    var uid: String { authViewModel.currentUser?.uid ?? "" }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .environmentObject(dashboardVM)
                .tabItem {
                    Label("Dashboard", systemImage: "house.fill")
                }
                .tag(0)

            TransactionsView()
                .environmentObject(transactionsVM)
                .tabItem {
                    Label("Transactions", systemImage: "list.bullet.rectangle.fill")
                }
                .tag(1)

            BudgetView()
                .environmentObject(budgetVM)
                .tabItem {
                    Label("Budget", systemImage: "chart.pie.fill")
                }
                .tag(2)

            AccountsView()
                .environmentObject(accountsVM)
                .tabItem {
                    Label("Accounts", systemImage: "building.columns.fill")
                }
                .tag(3)

            ReportsView()
                .environmentObject(reportsVM)
                .tabItem {
                    Label("Reports", systemImage: "chart.bar.fill")
                }
                .tag(4)
        }
        .onAppear {
            guard !uid.isEmpty else { return }
            dashboardVM.load(uid: uid)
            transactionsVM.load(uid: uid)
            budgetVM.load(uid: uid)
            accountsVM.load(uid: uid)
            reportsVM.load(uid: uid)
        }
    }
}
