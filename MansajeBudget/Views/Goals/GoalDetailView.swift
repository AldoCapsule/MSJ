import SwiftUI
import Charts

struct GoalDetailView: View {
    let goal: Goal
    @ObservedObject var viewModel: GoalsViewModel
    @State private var showEdit = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color(.systemGray5), lineWidth: 20)
                    Circle()
                        .trim(from: 0, to: goal.progress)
                        .stroke(goal.isComplete ? Color.green : Color.accentColor,
                                style: StrokeStyle(lineWidth: 20, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeInOut, value: goal.progress)
                    VStack(spacing: 4) {
                        Text("\(Int(goal.progress * 100))%")
                            .font(.title.bold())
                        Text(goal.isComplete ? "Complete!" : "of goal")
                            .font(.caption).foregroundColor(.secondary)
                    }
                }
                .frame(width: 180, height: 180)
                .padding(.top)

                // Stats
                HStack(spacing: 16) {
                    statCard(label: "Saved", value: goal.currentBalance.asCurrency, color: .green)
                    statCard(label: "Remaining", value: goal.remainingAmount.asCurrency, color: .orange)
                    statCard(label: "Target", value: goal.targetAmount.asCurrency, color: .blue)
                }
                .padding(.horizontal)

                // Projection card
                if !goal.isComplete {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Projection", systemImage: "chart.line.uptrend.xyaxis")
                            .font(.headline)
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Monthly needed").font(.caption).foregroundColor(.secondary)
                                Text(goal.requiredMonthlyContribution.asCurrency).font(.subheadline.bold())
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text("Months left").font(.caption).foregroundColor(.secondary)
                                Text("\(goal.monthsRemaining)").font(.subheadline.bold())
                            }
                        }
                        HStack {
                            Image(systemName: goal.onTrack ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundColor(goal.onTrack ? .green : .orange)
                            Text(goal.onTrack ? "On track" : "Behind schedule")
                                .font(.subheadline)
                                .foregroundColor(goal.onTrack ? .green : .orange)
                        }
                    }
                    .cardStyle()
                    .padding(.horizontal)
                }

                // Target date
                HStack {
                    Label("Target Date", systemImage: "calendar")
                    Spacer()
                    Text(goal.targetDate, style: .date).foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)
                .padding(.horizontal)
            }
        }
        .navigationTitle(goal.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { showEdit = true }
            }
        }
        .sheet(isPresented: $showEdit) {
            EditGoalView(goal: goal) { updated in viewModel.updateGoal(updated) }
        }
    }

    private func statCard(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.subheadline.bold()).foregroundColor(color)
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

struct EditGoalView: View {
    @Environment(\.dismiss) private var dismiss
    var goal: Goal
    let onSave: (Goal) -> Void

    @State private var name: String
    @State private var targetAmountText: String
    @State private var targetDate: Date
    @State private var monthlyText: String
    @State private var currentBalanceText: String

    init(goal: Goal, onSave: @escaping (Goal) -> Void) {
        self.goal = goal
        self.onSave = onSave
        _name = State(initialValue: goal.name)
        _targetAmountText = State(initialValue: String(goal.targetAmount))
        _targetDate = State(initialValue: goal.targetDate)
        _monthlyText = State(initialValue: String(goal.computedMonthlyContribution))
        _currentBalanceText = State(initialValue: String(goal.currentBalance))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Goal Info") {
                    TextField("Goal name", text: $name)
                }
                Section("Progress") {
                    HStack {
                        Text("Current Balance")
                        Spacer()
                        TextField("$0.00", text: $currentBalanceText)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    HStack {
                        Text("Target Amount")
                        Spacer()
                        TextField("$0.00", text: $targetAmountText)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    DatePicker("Target Date", selection: $targetDate, displayedComponents: .date)
                }
                Section("Monthly Contribution") {
                    HStack {
                        Text("Monthly Amount")
                        Spacer()
                        TextField("$0.00", text: $monthlyText)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                }
            }
            .navigationTitle("Edit Goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var updated = goal
                        updated.name = name
                        updated.targetAmount = Double(targetAmountText) ?? goal.targetAmount
                        updated.targetDate = targetDate
                        updated.computedMonthlyContribution = Double(monthlyText) ?? goal.computedMonthlyContribution
                        updated.currentBalance = Double(currentBalanceText) ?? goal.currentBalance
                        onSave(updated)
                        dismiss()
                    }
                }
            }
        }
    }
}
