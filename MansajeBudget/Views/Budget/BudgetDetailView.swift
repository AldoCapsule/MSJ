import SwiftUI
import Charts

struct BudgetDetailView: View {
    @EnvironmentObject var vm: BudgetViewModel
    @Environment(\.dismiss) private var dismiss

    @State var budget: Budget
    @State private var isEditingLimit = false
    @State private var limitText = ""
    @State private var showDeleteAlert = false
    @State private var showRolloverPicker = false

    private var relatedTransactions: [Transaction] {
        vm.transactions.filter { $0.category == budget.category && $0.isExpense }
            .sorted { $0.date > $1.date }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Progress Ring
                progressRing

                // Stats
                HStack(spacing: 16) {
                    budgetStat(label: "Limit", value: budget.limit.asCurrency, color: .blue)
                    budgetStat(label: "Spent", value: budget.spent.asCurrency, color: budget.isOverBudget ? .red : .orange)
                    budgetStat(label: "Remaining", value: budget.remaining.asCurrency, color: budget.isOverBudget ? .red : .green)
                }

                // Rollover Card
                if budget.rolloverEnabled {
                    rolloverCard
                }

                // Daily Spending Chart
                if !relatedTransactions.isEmpty {
                    dailySpendingChart
                }

                // Transactions
                transactionsList
            }
            .padding()
        }
        .navigationTitle(budget.category.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Edit Limit") {
                        limitText = String(budget.limit)
                        isEditingLimit = true
                    }
                    Divider()
                    Button(budget.rolloverEnabled ? "Disable Rollover" : "Enable Rollover") {
                        budget.rolloverEnabled.toggle()
                        vm.updateBudget(budget)
                    }
                    if budget.rolloverEnabled {
                        Button("Change Rollover Mode") {
                            showRolloverPicker = true
                        }
                    }
                    Divider()
                    Button("Delete Budget", role: .destructive) {
                        showDeleteAlert = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Edit Monthly Limit", isPresented: $isEditingLimit) {
            TextField("Limit", text: $limitText)
                .keyboardType(.decimalPad)
            Button("Save") {
                if let limit = Double(limitText) {
                    budget.limit = limit
                    vm.updateBudget(budget)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Delete Budget?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                vm.deleteBudget(budget)
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Rollover Mode", isPresented: $showRolloverPicker, titleVisibility: .visible) {
            Button("Carry Forward Remaining") {
                budget.rolloverMode = .carryForward
                vm.updateBudget(budget)
            }
            Button("Reset Each Month") {
                budget.rolloverMode = .resetEachMonth
                vm.updateBudget(budget)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("How should unused budget carry into the next month?")
        }
    }

    // MARK: - Progress Ring
    private var progressRing: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 16)

            Circle()
                .trim(from: 0, to: budget.progress)
                .stroke(
                    budget.isOverBudget ? Color.red : budget.category.color,
                    style: StrokeStyle(lineWidth: 16, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.easeOut, value: budget.progress)

            VStack(spacing: 4) {
                Text(budget.progress.asPercent)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                Text("used")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .frame(width: 160, height: 160)
        .padding()
    }

    // MARK: - Rollover Card
    private var rolloverCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Rollover", systemImage: "arrow.triangle.2.circlepath")
                    .font(.headline)
                Spacer()
                Text(budget.rolloverMode == .carryForward ? "Carry Forward" : "Reset Monthly")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color(.systemGray5))
                    .cornerRadius(8)
            }

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rollover Balance").font(.caption).foregroundColor(.secondary)
                    Text(budget.rolloverBalance.asCurrency)
                        .font(.subheadline.bold())
                        .foregroundColor(budget.rolloverBalance >= 0 ? .green : .red)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Effective Limit").font(.caption).foregroundColor(.secondary)
                    Text((budget.limit + budget.rolloverBalance).asCurrency)
                        .font(.subheadline.bold())
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    // MARK: - Budget Stat
    private func budgetStat(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.subheadline.bold())
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    // MARK: - Daily Spending Chart
    private var dailySpendingChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Daily Spending")
                .font(.headline)

            Chart(dailyData, id: \.date) { item in
                BarMark(
                    x: .value("Date", item.date, unit: .day),
                    y: .value("Amount", item.amount)
                )
                .foregroundStyle(budget.category.color)
            }
            .frame(height: 140)
            .chartYAxis { AxisMarks(format: .currency(code: "USD")) }
        }
        .cardStyle()
    }

    private var dailyData: [(date: Date, amount: Double)] {
        let grouped = Dictionary(grouping: relatedTransactions) { txn in
            Calendar.current.startOfDay(for: txn.date)
        }
        return grouped.map { (date: $0.key, amount: $0.value.reduce(0) { $0 + $1.amount }) }
            .sorted { $0.date < $1.date }
    }

    // MARK: - Transactions List
    private var transactionsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Transactions")
                .font(.headline)

            if relatedTransactions.isEmpty {
                Text("No transactions in this category")
                    .foregroundColor(.secondary)
                    .font(.subheadline)
                    .padding()
            } else {
                ForEach(relatedTransactions) { txn in
                    TransactionRowView(transaction: txn)
                    if txn.id != relatedTransactions.last?.id {
                        Divider()
                    }
                }
            }
        }
        .cardStyle()
    }
}
