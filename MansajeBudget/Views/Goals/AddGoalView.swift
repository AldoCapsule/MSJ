import SwiftUI

struct AddGoalView: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, GoalType, Double, Date, Double, String?) -> Void

    @State private var name = ""
    @State private var type: GoalType = .savings
    @State private var targetAmountText = ""
    @State private var targetDate = Calendar.current.date(byAdding: .year, value: 1, to: Date())!
    @State private var monthlyText = ""

    private var isValid: Bool {
        !name.isEmpty && Double(targetAmountText) != nil && Double(targetAmountText)! > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Goal Info") {
                    TextField("Goal name", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(GoalType.allCases, id: \.self) { t in
                            Label(t.displayName, systemImage: t.systemImage).tag(t)
                        }
                    }
                }

                Section("Target") {
                    HStack {
                        Text("Target Amount")
                        Spacer()
                        TextField("$0.00", text: $targetAmountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    DatePicker("Target Date", selection: $targetDate, displayedComponents: .date)
                }

                Section("Monthly Contribution") {
                    HStack {
                        Text("Monthly Amount")
                        Spacer()
                        TextField("$0.00", text: $monthlyText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    if let target = Double(targetAmountText), target > 0,
                       let monthly = Double(monthlyText), monthly > 0 {
                        let months = max(Int(ceil(target / monthly)), 1)
                        let projectedDate = Calendar.current.date(byAdding: .month, value: months, to: Date())!
                        Label("Estimated completion: \(projectedDate, style: .date)", systemImage: "calendar.badge.clock")
                            .font(.caption).foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("New Goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let target = Double(targetAmountText) else { return }
                        let monthly = Double(monthlyText) ?? 0
                        onSave(name, type, target, targetDate, monthly, nil)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
        }
    }
}
