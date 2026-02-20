import SwiftUI

struct AlertsView: View {
    @ObservedObject var viewModel: AlertsViewModel
    @State private var showAddRule = false
    @State private var selectedTab = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedTab) {
                    Text("Rules").tag(0)
                    Text("History").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()

                if selectedTab == 0 {
                    rulesTab
                } else {
                    eventsTab
                }
            }
            .navigationTitle("Alerts")
            .toolbar {
                if selectedTab == 0 {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showAddRule = true } label: { Image(systemName: "plus") }
                    }
                }
            }
            .sheet(isPresented: $showAddRule) {
                AddAlertRuleView { type, params, channel in
                    viewModel.addRule(type: type, params: params, channel: channel)
                }
            }
        }
    }

    private var rulesTab: some View {
        Group {
            if viewModel.rules.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "bell.slash.fill")
                        .font(.system(size: 48)).foregroundColor(.secondary)
                    Text("No Alert Rules").font(.title3.bold())
                    Text("Add rules to get notified about budget overages, low balances, and more.")
                        .foregroundColor(.secondary).multilineTextAlignment(.center).padding(.horizontal, 32)
                    Button("Add Rule") { showAddRule = true }.buttonStyle(.borderedProminent)
                    Spacer()
                }
            } else {
                List {
                    ForEach(viewModel.rules) { rule in
                        AlertRuleRowView(rule: rule,
                                         onToggle: { viewModel.toggleRule(rule) })
                    }
                    .onDelete { indexSet in
                        indexSet.map { viewModel.rules[$0] }.forEach { viewModel.deleteRule($0) }
                    }
                }
            }
        }
    }

    private var eventsTab: some View {
        Group {
            if viewModel.events.isEmpty {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 48)).foregroundColor(.green)
                    Text("All clear!").font(.title3.bold())
                    Text("No alerts have fired yet.").foregroundColor(.secondary)
                    Spacer()
                }
            } else {
                List {
                    ForEach(viewModel.events) { event in
                        AlertEventRowView(event: event) {
                            viewModel.acknowledgeEvent(event)
                        }
                    }
                }
            }
        }
    }
}

struct AlertRuleRowView: View {
    let rule: AlertRule
    let onToggle: () -> Void

    var body: some View {
        HStack {
            Image(systemName: rule.type.systemImage)
                .foregroundColor(rule.enabled ? .accentColor : .secondary)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(rule.type.displayName).font(.subheadline.bold())
                Text(ruleDetail).font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            Toggle("", isOn: Binding(get: { rule.enabled }, set: { _ in onToggle() }))
                .labelsHidden()
        }
    }

    private var ruleDetail: String {
        switch rule.type {
        case .budgetThreshold:
            return "At \(Int(rule.params.thresholdPct ?? 80))% of budget"
        case .lowBalance:
            return "Below \((rule.params.amountThreshold ?? 0).asCurrency)"
        case .largeTxn:
            return "Transactions over \((rule.params.amountThreshold ?? 0).asCurrency)"
        case .priceChange:
            return "Subscription price changes"
        }
    }
}

struct AlertEventRowView: View {
    let event: AlertEvent
    let onAcknowledge: () -> Void

    var body: some View {
        HStack {
            Image(systemName: event.isAcknowledged ? "checkmark.circle.fill" : "bell.fill")
                .foregroundColor(event.isAcknowledged ? .secondary : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.firedAt, style: .relative).font(.subheadline)
                if let cat = event.payload["category"] {
                    Text(cat).font(.caption).foregroundColor(.secondary)
                }
            }
            Spacer()
            if !event.isAcknowledged {
                Button("Dismiss") { onAcknowledge() }
                    .buttonStyle(.bordered).controlSize(.small)
            }
        }
        .opacity(event.isAcknowledged ? 0.6 : 1)
    }
}

struct AddAlertRuleView: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (AlertRuleType, AlertRuleParams, AlertChannel) -> Void

    @State private var type: AlertRuleType = .budgetThreshold
    @State private var channel: AlertChannel = .push
    @State private var thresholdText = "80"
    @State private var amountText = "100"

    var body: some View {
        NavigationStack {
            Form {
                Section("Alert Type") {
                    Picker("Type", selection: $type) {
                        ForEach(AlertRuleType.allCases, id: \.self) { t in
                            Label(t.displayName, systemImage: t.systemImage).tag(t)
                        }
                    }
                }
                Section("Threshold") {
                    if type == .budgetThreshold {
                        HStack {
                            Text("At % of budget")
                            Spacer()
                            TextField("80", text: $thresholdText)
                                .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                            Text("%")
                        }
                    } else if type == .lowBalance || type == .largeTxn {
                        HStack {
                            Text("Amount")
                            Spacer()
                            TextField("$0.00", text: $amountText)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        }
                    }
                }
                Section("Delivery") {
                    Picker("Channel", selection: $channel) {
                        ForEach(AlertChannel.allCases, id: \.self) { c in
                            Text(c.displayName).tag(c)
                        }
                    }
                }
            }
            .navigationTitle("New Alert Rule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let params: AlertRuleParams
                        switch type {
                        case .budgetThreshold:
                            params = .budgetThreshold(categoryId: nil, pct: Double(thresholdText) ?? 80)
                        case .lowBalance:
                            params = .lowBalance(accountId: "", amount: Double(amountText) ?? 100)
                        case .largeTxn:
                            params = AlertRuleParams(amountThreshold: Double(amountText) ?? 100)
                        case .priceChange:
                            params = AlertRuleParams()
                        }
                        onSave(type, params, channel)
                        dismiss()
                    }
                }
            }
        }
    }
}
