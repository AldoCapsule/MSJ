import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    // Existing VMs — passed as environmentObjects to match existing views
    @StateObject private var dashboardVM    = DashboardViewModel()
    @StateObject private var transactionsVM = TransactionsViewModel()
    @StateObject private var budgetVM       = BudgetViewModel()
    @StateObject private var accountsVM     = AccountsViewModel()
    @StateObject private var reportsVM      = ReportsViewModel()

    // New VMs — passed as init parameters to new views
    @StateObject private var goalsVM        = GoalsViewModel()
    @StateObject private var alertsVM       = AlertsViewModel()
    @StateObject private var recurringVM    = RecurringViewModel()
    @StateObject private var investmentsVM  = InvestmentsViewModel()
    @StateObject private var categoriesVM   = CategoriesViewModel()
    @StateObject private var rulesVM        = RulesViewModel()

    @State private var selectedTab = 0

    var uid: String { authViewModel.currentUser?.uid ?? "" }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .environmentObject(dashboardVM)
                .tabItem { Label("Dashboard", systemImage: "house.fill") }
                .tag(0)

            TransactionsView()
                .environmentObject(transactionsVM)
                .tabItem { Label("Transactions", systemImage: "list.bullet.rectangle.fill") }
                .tag(1)

            BudgetView()
                .environmentObject(budgetVM)
                .tabItem { Label("Budget", systemImage: "chart.pie.fill") }
                .tag(2)

            GoalsView(viewModel: goalsVM)
                .tabItem { Label("Goals", systemImage: "flag.fill") }
                .tag(3)

            moreNavigation
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
                .tag(4)
        }
        .onAppear {
            guard !uid.isEmpty else { return }
            dashboardVM.load(uid: uid)
            transactionsVM.load(uid: uid)
            budgetVM.load(uid: uid)
            accountsVM.load(uid: uid)
            reportsVM.load(uid: uid)
            goalsVM.load(uid: uid)
            alertsVM.load(uid: uid)
            categoriesVM.load(uid: uid)
            rulesVM.load(uid: uid)
        }
    }

    // "More" tab — houses Accounts, Reports, and all new modules
    private var moreNavigation: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        AccountsView().environmentObject(accountsVM)
                    } label: {
                        Label("Accounts", systemImage: "building.columns.fill")
                    }
                    NavigationLink {
                        ReportsView().environmentObject(reportsVM)
                    } label: {
                        Label("Reports", systemImage: "chart.bar.fill")
                    }
                }

                Section("Tools") {
                    NavigationLink {
                        RecurringView(viewModel: recurringVM)
                    } label: {
                        Label("Recurring", systemImage: "repeat.circle.fill")
                    }
                    NavigationLink {
                        HoldingsView(viewModel: investmentsVM)
                    } label: {
                        Label("Investments", systemImage: "chart.line.uptrend.xyaxis")
                    }
                    NavigationLink {
                        AlertsView(viewModel: alertsVM)
                    } label: {
                        HStack {
                            Label("Alerts", systemImage: "bell.fill")
                            Spacer()
                            if alertsVM.unacknowledgedCount > 0 {
                                Text("\(alertsVM.unacknowledgedCount)")
                                    .font(.caption.bold()).foregroundColor(.white)
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(Color.red).cornerRadius(10)
                            }
                        }
                    }
                }

                Section("Customize") {
                    NavigationLink {
                        CategoriesView(viewModel: categoriesVM)
                    } label: {
                        Label("Categories", systemImage: "tag.fill")
                    }
                    NavigationLink {
                        RulesView(viewModel: rulesVM)
                    } label: {
                        Label("Auto-Categorize", systemImage: "wand.and.stars")
                    }
                }

                Section {
                    NavigationLink {
                        SettingsView()
                            .environmentObject(authViewModel)
                    } label: {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("More")
        }
    }
}
