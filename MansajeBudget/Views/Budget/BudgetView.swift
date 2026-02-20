import SwiftUI

struct BudgetView: View {
    @EnvironmentObject var vm: BudgetViewModel
    @State private var showAddBudget = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.budgets.isEmpty {
                    ProgressView("Loading budgets…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    budgetContent
                }
            }
            .navigationTitle("Budget")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddBudget = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                    }
                }
            }
            .sheet(isPresented: $showAddBudget) {
                AddBudgetSheet()
                    .environmentObject(vm)
            }
        }
    }

    private var budgetContent: some View {
        List {
            // Month navigation
            Section {
                HStack {
                    Button {
                        vm.navigateMonth(forward: false)
                    } label: {
                        Image(systemName: "chevron.left.circle.fill")
                            .font(.title2)
                    }
                    Spacer()
                    VStack {
                        Text(monthLabel)
                            .font(.headline)
                        Text("\(vm.totalSpent.asCurrency) / \(vm.totalLimit.asCurrency)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Button {
                        vm.navigateMonth(forward: true)
                    } label: {
                        Image(systemName: "chevron.right.circle.fill")
                            .font(.title2)
                    }
                }
                .padding(.vertical, 4)
            }

            // Total progress
            if vm.totalLimit > 0 {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        ProgressView(value: vm.totalSpent / vm.totalLimit)
                            .tint(vm.totalSpent > vm.totalLimit ? .red : .accentColor)
                        HStack {
                            Text("\(vm.totalSpent.asCurrency) spent")
                            Spacer()
                            Text("\((vm.totalLimit - vm.totalSpent).asCurrency) remaining")
                                .foregroundColor(vm.totalSpent > vm.totalLimit ? .red : .green)
                        }
                        .font(.caption)
                    }
                }
            }

            // Budget rows
            Section("Categories") {
                if vm.budgets.isEmpty {
                    Text("No budgets set. Tap + to add one.")
                        .foregroundColor(.secondary)
                        .italic()
                } else {
                    ForEach(vm.budgets) { budget in
                        NavigationLink {
                            BudgetDetailView(budget: budget)
                                .environmentObject(vm)
                        } label: {
                            BudgetRowView(budget: budget)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                vm.deleteBudget(budget)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var monthLabel: String {
        var comps = DateComponents()
        comps.month = vm.selectedMonth
        comps.year = vm.selectedYear
        comps.day = 1
        let date = Calendar.current.date(from: comps) ?? Date()
        return date.formatted_monthYear
    }
}

// MARK: - Budget Row
struct BudgetRowView: View {
    let budget: Budget

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(budget.category.displayName, systemImage: budget.category.systemImage)
                    .foregroundColor(budget.category.color)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text("\(budget.spent.asCurrency) / \(budget.limit.asCurrency)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            ProgressView(value: budget.progress)
                .tint(budget.isOverBudget ? .red : budget.category.color)

            if budget.isOverBudget {
                Text("\((budget.spent - budget.limit).asCurrency) over budget")
                    .font(.caption)
                    .foregroundColor(.red)
            } else {
                Text("\(budget.remaining.asCurrency) remaining")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Add Budget Sheet
struct AddBudgetSheet: View {
    @EnvironmentObject var vm: BudgetViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var category: TransactionCategory = .food
    @State private var limitText = ""

    private var limit: Double? { Double(limitText) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Category") {
                    Picker("Category", selection: $category) {
                        ForEach(TransactionCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.systemImage).tag(cat)
                        }
                    }
                }
                Section("Monthly Limit") {
                    HStack {
                        Text("$")
                        TextField("0.00", text: $limitText)
                            .keyboardType(.decimalPad)
                    }
                }
            }
            .navigationTitle("New Budget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add") {
                        guard let limit else { return }
                        vm.addBudget(category: category, limit: limit)
                        dismiss()
                    }
                    .disabled(limit == nil || limit! <= 0)
                    .fontWeight(.semibold)
                }
            }
        }
    }
}
