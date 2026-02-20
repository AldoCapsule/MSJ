import SwiftUI

struct AddTransactionView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: TransactionsViewModel

    let uid: String

    @State private var name = ""
    @State private var amountText = ""
    @State private var date = Date()
    @State private var category: TransactionCategory = .other
    @State private var accountId = ""
    @State private var notes = ""
    @State private var isExpense = true

    private var amount: Double? { Double(amountText) }
    private var isValid: Bool {
        !name.isEmpty && amount != nil && amount! > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                // Type toggle
                Section {
                    Picker("Type", selection: $isExpense) {
                        Text("Expense").tag(true)
                        Text("Income").tag(false)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Details") {
                    TextField("Description", text: $name)
                    HStack {
                        Text(isExpense ? "-$" : "+$")
                            .foregroundColor(isExpense ? .red : .green)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }

                Section("Category") {
                    Picker("Category", selection: $category) {
                        ForEach(TransactionCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.systemImage)
                                .tag(cat)
                        }
                    }
                }

                Section("Notes (optional)") {
                    TextField("Add notes…", text: $notes, axis: .vertical)
                        .lineLimit(3...5)
                }
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .disabled(!isValid)
                        .fontWeight(.semibold)
                }
            }
        }
    }

    private func save() {
        guard let amount = amount else { return }
        let txn = Transaction(
            amount: isExpense ? amount : -amount,
            date: date,
            name: name,
            category: category,
            accountId: accountId.isEmpty ? "manual" : accountId,
            userId: uid,
            notes: notes.isEmpty ? nil : notes,
            isManual: true
        )
        vm.addTransaction(txn)
        dismiss()
    }
}
