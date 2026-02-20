import SwiftUI

struct TransactionDetailView: View {
    @EnvironmentObject var vm: TransactionsViewModel
    @Environment(\.dismiss) private var dismiss

    @State var transaction: Transaction
    @State private var isEditing = false
    @State private var showDeleteAlert = false

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

                    if transaction.isPending {
                        Label("Pending", systemImage: "clock.fill")
                            .font(.caption)
                            .foregroundColor(.orange)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.orange.opacity(0.15))
                            .cornerRadius(20)
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

                // Actions
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
