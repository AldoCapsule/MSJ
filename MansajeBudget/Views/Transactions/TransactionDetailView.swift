import SwiftUI

struct TransactionDetailView: View {
    @EnvironmentObject var vm: TransactionsViewModel
    @Environment(\.dismiss) private var dismiss

    @State var transaction: Transaction
    @State private var isEditing = false
    @State private var showDeleteAlert = false
    @State private var showSplitSheet = false

    // Edit state
    @State private var editName = ""
    @State private var editAmountText = ""
    @State private var editCategory: TransactionCategory = .other
    @State private var editDate = Date()
    @State private var editNotes = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Amount Hero
                VStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(transaction.category.color.opacity(0.15))
                            .frame(width: 80, height: 80)
                        Image(systemName: transaction.category.systemImage)
                            .font(.system(size: 36))
                            .foregroundColor(transaction.category.color)
                    }

                    Text(transaction.isExpense
                         ? "-\(transaction.absoluteAmount.asCurrency)"
                         : "+\(transaction.absoluteAmount.asCurrency)")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundColor(transaction.isExpense ? .primary : .green)

                    HStack(spacing: 8) {
                        if transaction.isPending {
                            statusBadge(label: "Pending", icon: "clock.fill", color: .orange)
                        } else {
                            statusBadge(label: "Posted", icon: "checkmark.circle.fill", color: .green)
                        }
                        if transaction.isTransfer {
                            statusBadge(label: "Transfer", icon: "arrow.left.arrow.right", color: .blue)
                        }
                        if transaction.isSplit {
                            statusBadge(label: "Split", icon: "scissors", color: .purple)
                        }
                        if transaction.reviewStatus == .reviewed {
                            statusBadge(label: "Reviewed", icon: "checkmark.seal.fill", color: .teal)
                        }
                    }
                }
                .padding(.top)

                // Details Card
                VStack(spacing: 0) {
                    detailRow(label: "Merchant", value: transaction.name)
                    Divider().padding(.leading)
                    detailRow(label: "Category", value: transaction.category.displayName)
                    Divider().padding(.leading)
                    detailRow(label: "Date", value: transaction.date.formatted_mdy)
                    if let raw = transaction.rawDescription, !raw.isEmpty, raw != transaction.name {
                        Divider().padding(.leading)
                        detailRow(label: "Original", value: raw)
                    }
                    if let notes = transaction.notes, !notes.isEmpty {
                        Divider().padding(.leading)
                        detailRow(label: "Notes", value: notes)
                    }
                    if transaction.isManual {
                        Divider().padding(.leading)
                        detailRow(label: "Source", value: "Manually added")
                    }
                }
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                .padding(.horizontal)

                // Smart Actions Card
                VStack(spacing: 0) {
                    // Hide from budgets toggle
                    HStack {
                        Label("Hide from Budgets", systemImage: "eye.slash")
                            .font(.subheadline)
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { transaction.isHidden },
                            set: { newValue in
                                var updated = transaction
                                updated.isHidden = newValue
                                transaction = updated
                                vm.updateTransaction(updated)
                            }
                        ))
                        .labelsHidden()
                    }
                    .padding()

                    if !transaction.isManual && transaction.reviewStatus != .reviewed {
                        Divider().padding(.leading)
                        Button {
                            var updated = transaction
                            updated.reviewStatus = .reviewed
                            updated.reviewedAt = Date()
                            transaction = updated
                            vm.updateTransaction(updated)
                        } label: {
                            HStack {
                                Label("Mark as Reviewed", systemImage: "checkmark.seal")
                                    .font(.subheadline)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .foregroundColor(.primary)
                        }
                    }

                    if !transaction.isSplit && transaction.isManual {
                        Divider().padding(.leading)
                        Button {
                            showSplitSheet = true
                        } label: {
                            HStack {
                                Label("Split Transaction", systemImage: "scissors")
                                    .font(.subheadline)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .foregroundColor(.primary)
                        }
                    }
                }
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                .padding(.horizontal)

                // Manual-only actions
                if transaction.isManual {
                    VStack(spacing: 12) {
                        Button {
                            setupEditState()
                            isEditing = true
                        } label: {
                            Label("Edit Transaction", systemImage: "pencil")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.accentColor)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                        }

                        Button(role: .destructive) {
                            showDeleteAlert = true
                        } label: {
                            Label("Delete Transaction", systemImage: "trash")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.red.opacity(0.1))
                                .foregroundColor(.red)
                                .cornerRadius(12)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.bottom, 32)
        }
        .navigationTitle(transaction.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isEditing) {
            editSheet
        }
        .sheet(isPresented: $showSplitSheet) {
            SplitTransactionView(transaction: transaction) { splits in
                // Mark original as split and save each split
                var updated = transaction
                updated.isSplit = true
                transaction = updated
                vm.updateTransaction(updated)
                splits.forEach { vm.addTransaction($0) }
            }
        }
        .alert("Delete Transaction?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                vm.deleteTransaction(transaction)
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
    }

    // MARK: - Status Badge
    private func statusBadge(label: String, icon: String, color: Color) -> some View {
        Label(label, systemImage: icon)
            .font(.caption)
            .foregroundColor(color)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .cornerRadius(20)
    }

    // MARK: - Detail Row
    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.trailing)
        }
        .padding()
    }

    // MARK: - Edit Sheet
    private var editSheet: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Description", text: $editName)
                    TextField("Amount", text: $editAmountText)
                        .keyboardType(.decimalPad)
                    DatePicker("Date", selection: $editDate, displayedComponents: .date)
                }
                Section("Category") {
                    Picker("Category", selection: $editCategory) {
                        ForEach(TransactionCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.systemImage).tag(cat)
                        }
                    }
                }
                Section("Notes") {
                    TextField("Notes", text: $editNotes, axis: .vertical)
                        .lineLimit(3...5)
                }
            }
            .navigationTitle("Edit Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { isEditing = false }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { saveEdits() }
                        .fontWeight(.semibold)
                }
            }
        }
    }

    private func setupEditState() {
        editName = transaction.name
        editAmountText = String(transaction.absoluteAmount)
        editCategory = transaction.category
        editDate = transaction.date
        editNotes = transaction.notes ?? ""
    }

    private func saveEdits() {
        guard let amount = Double(editAmountText) else { return }
        var updated = transaction
        updated.name = editName
        updated.amount = transaction.isExpense ? amount : -amount
        updated.category = editCategory
        updated.date = editDate
        updated.notes = editNotes.isEmpty ? nil : editNotes
        transaction = updated
        vm.updateTransaction(updated)
        isEditing = false
    }
}

// MARK: - Split Transaction View
struct SplitTransactionView: View {
    @Environment(\.dismiss) private var dismiss
    let transaction: Transaction
    let onSave: ([Transaction]) -> Void

    @State private var amount1Text: String
    @State private var amount2Text: String
    @State private var category1: TransactionCategory
    @State private var category2: TransactionCategory = .other
    @State private var notes1 = ""
    @State private var notes2 = ""

    init(transaction: Transaction, onSave: @escaping ([Transaction]) -> Void) {
        self.transaction = transaction
        self.onSave = onSave
        let half = String(format: "%.2f", transaction.absoluteAmount / 2)
        _amount1Text = State(initialValue: half)
        _amount2Text = State(initialValue: half)
        _category1 = State(initialValue: transaction.category)
    }

    private var total: Double { (Double(amount1Text) ?? 0) + (Double(amount2Text) ?? 0) }
    private var isValid: Bool { abs(total - transaction.absoluteAmount) < 0.01 }

    var body: some View {
        NavigationStack {
            Form {
                Section("Split 1") {
                    HStack {
                        Text("Amount").foregroundColor(.secondary)
                        Spacer()
                        TextField("0.00", text: $amount1Text).keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    Picker("Category", selection: $category1) {
                        ForEach(TransactionCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.systemImage).tag(cat)
                        }
                    }
                    TextField("Notes (optional)", text: $notes1)
                }

                Section("Split 2") {
                    HStack {
                        Text("Amount").foregroundColor(.secondary)
                        Spacer()
                        TextField("0.00", text: $amount2Text).keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    Picker("Category", selection: $category2) {
                        ForEach(TransactionCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.systemImage).tag(cat)
                        }
                    }
                    TextField("Notes (optional)", text: $notes2)
                }

                Section {
                    HStack {
                        Text("Total").foregroundColor(.secondary)
                        Spacer()
                        Text(total.asCurrency)
                            .foregroundColor(isValid ? .primary : .red)
                    }
                    if !isValid {
                        Text("Splits must sum to \(transaction.absoluteAmount.asCurrency)")
                            .font(.caption).foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Split Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard isValid else { return }
                        let sign: Double = transaction.isExpense ? 1 : -1
                        var s1 = transaction; s1.id = UUID().uuidString
                        s1.amount = (Double(amount1Text) ?? 0) * sign
                        s1.category = category1
                        s1.notes = notes1.isEmpty ? nil : notes1
                        s1.isSplit = true; s1.lineageGroupId = transaction.id

                        var s2 = transaction; s2.id = UUID().uuidString
                        s2.amount = (Double(amount2Text) ?? 0) * sign
                        s2.category = category2
                        s2.notes = notes2.isEmpty ? nil : notes2
                        s2.isSplit = true; s2.lineageGroupId = transaction.id

                        onSave([s1, s2])
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
        }
    }
}
