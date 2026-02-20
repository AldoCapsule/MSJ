import SwiftUI

struct TransactionsView: View {
    @EnvironmentObject var vm: TransactionsViewModel
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.transactions.isEmpty {
                    ProgressView("Loading transactions…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.filteredTransactions.isEmpty {
                    emptyState
                } else {
                    transactionsList
                }
            }
            .navigationTitle("Transactions")
            .searchable(text: $vm.searchText, prompt: "Search transactions")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    filterMenu
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        vm.showAddTransaction = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                    }
                }
            }
            .sheet(isPresented: $vm.showAddTransaction) {
                AddTransactionView(uid: authViewModel.currentUser?.uid ?? "")
                    .environmentObject(vm)
            }
        }
    }

    // MARK: - List
    private var transactionsList: some View {
        List {
            ForEach(vm.groupedTransactions, id: \.0) { date, txns in
                Section(header: Text(date.formatted_relativeDay).font(.subheadline.weight(.semibold))) {
                    ForEach(txns) { txn in
                        NavigationLink {
                            TransactionDetailView(transaction: txn)
                                .environmentObject(vm)
                        } label: {
                            TransactionRowView(transaction: txn)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                vm.deleteTransaction(txn)
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

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray.fill")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text(vm.searchText.isEmpty ? "No transactions yet" : "No results found")
                .font(.headline)
            Text(vm.searchText.isEmpty ? "Link a bank account or add a transaction manually." : "Try a different search term or filter.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            if !vm.searchText.isEmpty {
                Button("Clear Search") { vm.clearFilters() }
                    .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: - Filter Menu
    private var filterMenu: some View {
        Menu {
            Button("All Categories") { vm.selectedCategory = nil }
            Divider()
            ForEach(TransactionCategory.allCases) { category in
                Button {
                    vm.selectedCategory = category
                } label: {
                    Label(category.displayName, systemImage: category.systemImage)
                }
            }
        } label: {
            Image(systemName: vm.selectedCategory == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                .font(.title3)
        }
    }
}
