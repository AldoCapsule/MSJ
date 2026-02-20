import SwiftUI

struct AccountsView: View {
    @EnvironmentObject var vm: AccountsViewModel

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.accounts.isEmpty {
                    ProgressView("Loading accounts…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    accountContent
                }
            }
            .navigationTitle("Accounts")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        vm.startPlaidLink()
                    } label: {
                        Label("Link Account", systemImage: "plus.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $vm.showLinkSheet) {
                if let token = vm.linkToken {
                    LinkAccountView(linkToken: token)
                        .environmentObject(vm)
                }
            }
            .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
                Button("OK") { vm.errorMessage = nil }
            } message: {
                Text(vm.errorMessage ?? "")
            }
        }
    }

    private var accountContent: some View {
        List {
            // Net Worth Summary
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Total Balance")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(vm.totalBalance.asCurrency)
                        .font(.title2.bold())
                }
                .padding(.vertical, 4)
            }

            // Grouped by account type
            ForEach(AccountType.allCases, id: \.self) { type in
                let typeAccounts = vm.accounts.filter { $0.type == type }
                if !typeAccounts.isEmpty {
                    Section(type.displayName) {
                        ForEach(typeAccounts) { account in
                            AccountRowView(account: account)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        vm.deleteAccount(account)
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        vm.refreshAccount(account)
                                    } label: {
                                        Label("Refresh", systemImage: "arrow.clockwise")
                                    }
                                    .tint(.blue)
                                }
                        }
                    }
                }
            }

            // Empty State
            if vm.accounts.isEmpty {
                Section {
                    VStack(spacing: 16) {
                        Image(systemName: "building.columns")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("No accounts linked")
                            .font(.headline)
                        Text("Tap the + button to securely connect your bank accounts via Plaid.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Link Bank Account") {
                            vm.startPlaidLink()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            for account in vm.accounts {
                vm.refreshAccount(account)
            }
        }
    }
}

// MARK: - Account Row
struct AccountRowView: View {
    let account: Account

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.accentColor.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: account.type.systemImage)
                    .foregroundColor(.accentColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.subheadline.weight(.medium))
                Text(account.institutionName + (account.mask.map { " ••\($0)" } ?? ""))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text(account.balance.asCurrency)
                .font(.subheadline.bold())
                .foregroundColor(account.type == .credit || account.type == .loan ? .red : .primary)
        }
        .padding(.vertical, 4)
    }
}
