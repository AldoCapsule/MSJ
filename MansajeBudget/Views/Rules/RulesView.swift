import SwiftUI

struct RulesView: View {
    @ObservedObject var viewModel: RulesViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showAddRule = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.rules.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(viewModel.rules) { rule in
                            RuleRowView(rule: rule,
                                        onToggle: { viewModel.toggleRule(rule) },
                                        onApply: { viewModel.applyRuleToHistory(rule) })
                        }
                        .onDelete { indexSet in
                            indexSet.map { viewModel.rules[$0] }.forEach { viewModel.deleteRule($0) }
                        }
                    }
                }
            }
            .navigationTitle("Categorization Rules")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddRule = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showAddRule) {
                AddRuleView { matchType, matchValue, categoryId, priority, scope in
                    viewModel.addRule(matchType: matchType, matchValue: matchValue,
                                      categoryId: categoryId, priority: priority, applyScope: scope)
                }
            }
            .alert("Applied", isPresented: .constant(viewModel.successMessage != nil)) {
                Button("OK") { viewModel.successMessage = nil }
            } message: { Text(viewModel.successMessage ?? "") }
        }
        .onAppear {
            if let uid = authViewModel.currentUser?.uid { viewModel.load(uid: uid) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wand.and.stars")
                .font(.system(size: 52)).foregroundColor(.secondary)
            Text("No Rules Yet").font(.title2.bold())
            Text("Rules automatically categorize transactions as they come in.")
                .foregroundColor(.secondary).multilineTextAlignment(.center).padding(.horizontal, 32)
            Button("Add Rule") { showAddRule = true }.buttonStyle(.borderedProminent)
        }.padding()
    }
}

struct RuleRowView: View {
    let rule: CategorizationRule
    let onToggle: () -> Void
    let onApply: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Toggle("", isOn: Binding(get: { rule.enabled }, set: { _ in onToggle() }))
                    .labelsHidden()
                VStack(alignment: .leading, spacing: 2) {
                    Text(rule.matchType.displayName).font(.caption).foregroundColor(.secondary)
                    Text(rule.matchValue).font(.subheadline.bold())
                }
                Spacer()
                Text("→ \(rule.actionCategoryId)").font(.caption).foregroundColor(.accentColor)
            }
            HStack {
                Text("Priority \(rule.priority)").font(.caption).foregroundColor(.secondary)
                Spacer()
                Button("Apply to history") { onApply() }
                    .font(.caption).buttonStyle(.bordered).controlSize(.mini)
            }
        }
        .padding(.vertical, 4)
        .opacity(rule.enabled ? 1 : 0.6)
    }
}

struct AddRuleView: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (RuleMatchType, String, String, Int, RuleApplyScope) -> Void

    @State private var matchType: RuleMatchType = .merchant
    @State private var matchValue = ""
    @State private var categoryId = ""
    @State private var priorityText = "100"
    @State private var applyScope: RuleApplyScope = .newOnly

    var body: some View {
        NavigationStack {
            Form {
                Section("Match Condition") {
                    Picker("Match Type", selection: $matchType) {
                        ForEach(RuleMatchType.allCases, id: \.self) { t in
                            Text(t.displayName).tag(t)
                        }
                    }
                    TextField(matchType == .regex ? "e.g. ^Amazon.*" : "e.g. Starbucks",
                              text: $matchValue)
                }
                Section("Action") {
                    TextField("Category name or ID", text: $categoryId)
                    Picker("Apply to", selection: $applyScope) {
                        ForEach(RuleApplyScope.allCases, id: \.self) { s in
                            Text(s.displayName).tag(s)
                        }
                    }
                }
                Section("Priority") {
                    HStack {
                        Text("Priority (lower runs first)")
                        Spacer()
                        TextField("100", text: $priorityText).keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                }
            }
            .navigationTitle("New Rule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard !matchValue.isEmpty, !categoryId.isEmpty else { return }
                        onSave(matchType, matchValue, categoryId,
                               Int(priorityText) ?? 100, applyScope)
                        dismiss()
                    }
                    .disabled(matchValue.isEmpty || categoryId.isEmpty)
                }
            }
        }
    }
}
