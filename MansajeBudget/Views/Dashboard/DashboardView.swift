import SwiftUI
import Charts

struct DashboardView: View {
    @EnvironmentObject var vm: DashboardViewModel
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    // Net Worth Card
                    netWorthCard

                    // Quick Stats
                    HStack(spacing: 12) {
                        statCard(
                            title: "Assets",
                            amount: vm.totalAssets,
                            color: .green,
                            icon: "arrow.up.circle.fill"
                        )
                        statCard(
                            title: "Liabilities",
                            amount: vm.totalLiabilities,
                            color: .red,
                            icon: "arrow.down.circle.fill"
                        )
                    }

                    // Monthly Spending
                    monthlySpendingCard

                    // Budget Summary
                    if !vm.budgets.isEmpty {
                        budgetSummaryCard
                    }

                    // Recent Transactions
                    recentTransactionsSection
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsView().environmentObject(authViewModel)
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
            .refreshable {
                if let uid = authViewModel.currentUser?.uid {
                    vm.load(uid: uid)
                }
            }
        }
    }

    // MARK: - Net Worth Card
    private var netWorthCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Net Worth")
                .font(.headline)
                .foregroundColor(.secondary)
            Text(vm.netWorth.asCurrency)
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(.linearGradient(
                    colors: vm.netWorth >= 0 ? [.blue, .cyan] : [.red, .orange],
                    startPoint: .leading,
                    endPoint: .trailing
                ))
            Text("Updated \(Date().formatted_relativeDay)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Stat Card
    private func statCard(title: String, amount: Double, color: Color, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.caption)
                .foregroundColor(color)
            Text(amount.asCurrency)
                .font(.title3.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Monthly Spending
    private var monthlySpendingCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This Month's Spending")
                .font(.headline)
            Text(vm.monthlySpending.asCurrency)
                .font(.title2.bold())
                .foregroundColor(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Budget Summary
    private var budgetSummaryCard: some View {
        let summary = vm.budgetSummary
        return VStack(alignment: .leading, spacing: 12) {
            Label("Budget Overview", systemImage: "chart.pie.fill")
                .font(.headline)

            ProgressView(value: summary.total > 0 ? summary.spent / summary.total : 0)
                .tint(summary.spent > summary.total ? .red : .accentColor)

            HStack {
                Text("\(summary.spent.asCurrency) of \(summary.total.asCurrency)")
                    .font(.subheadline)
                Spacer()
                Text("\((summary.total - summary.spent).asCurrency) left")
                    .font(.subheadline)
                    .foregroundColor(summary.spent > summary.total ? .red : .green)
            }
        }
        .cardStyle()
    }

    // MARK: - Recent Transactions
    private var recentTransactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Transactions")
                    .font(.headline)
                Spacer()
                NavigationLink("See All") {
                    // Will link to transactions tab
                }
                .font(.subheadline)
            }

            if vm.recentTransactions.isEmpty {
                Text("No transactions yet")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                ForEach(vm.recentTransactions.prefix(5)) { txn in
                    TransactionRowView(transaction: txn)
                    if txn.id != vm.recentTransactions.prefix(5).last?.id {
                        Divider()
                    }
                }
            }
        }
        .cardStyle()
    }
}

// MARK: - Transaction Row
struct TransactionRowView: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(transaction.category.color.opacity(0.2))
                    .frame(width: 40, height: 40)
                Image(systemName: transaction.category.systemImage)
                    .font(.system(size: 18))
                    .foregroundColor(transaction.category.color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(transaction.category.displayName)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(transaction.isExpense ? "-\(transaction.absoluteAmount.asCurrency)" : "+\(transaction.absoluteAmount.asCurrency)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(transaction.isExpense ? .primary : .green)
                Text(transaction.date.formatted_relativeDay)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}
