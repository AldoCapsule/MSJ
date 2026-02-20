import SwiftUI

struct GoalsView: View {
    @ObservedObject var viewModel: GoalsViewModel
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.goals.isEmpty {
                    ProgressView()
                } else if viewModel.goals.isEmpty {
                    emptyState
                } else {
                    goalsList
                }
            }
            .navigationTitle("Goals")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showAddGoal = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $viewModel.showAddGoal) {
                AddGoalView { name, type, target, date, monthly, accountId in
                    viewModel.addGoal(name: name, type: type, targetAmount: target,
                                      targetDate: date, monthlyContribution: monthly,
                                      fundingAccountId: accountId)
                }
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .onAppear {
            if let uid = authViewModel.currentUser?.uid {
                viewModel.load(uid: uid)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "flag.fill")
                .font(.system(size: 52))
                .foregroundColor(.secondary)
            Text("No Goals Yet")
                .font(.title2.bold())
            Text("Set savings or debt payoff goals to track your progress.")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Add Your First Goal") { viewModel.showAddGoal = true }
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private var goalsList: some View {
        List {
            // Summary card
            Section {
                HStack(spacing: 0) {
                    summaryTile(label: "Total Saved",
                                value: viewModel.totalCurrentBalance.asCurrency,
                                color: .green)
                    Divider()
                    summaryTile(label: "Total Target",
                                value: viewModel.totalTargetAmount.asCurrency,
                                color: .blue)
                    Divider()
                    summaryTile(label: "Completed",
                                value: "\(viewModel.completedGoals.count)",
                                color: .purple)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            if !viewModel.activeGoals.isEmpty {
                Section("Active") {
                    ForEach(viewModel.activeGoals) { goal in
                        NavigationLink(destination: GoalDetailView(goal: goal, viewModel: viewModel)) {
                            GoalRowView(goal: goal)
                        }
                    }
                    .onDelete { indexSet in
                        indexSet.map { viewModel.activeGoals[$0] }.forEach { viewModel.deleteGoal($0) }
                    }
                }
            }

            if !viewModel.completedGoals.isEmpty {
                Section("Completed") {
                    ForEach(viewModel.completedGoals) { goal in
                        NavigationLink(destination: GoalDetailView(goal: goal, viewModel: viewModel)) {
                            GoalRowView(goal: goal)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.fetchGoals() }
    }

    private func summaryTile(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.headline.bold()).foregroundColor(color)
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct GoalRowView: View {
    let goal: Goal

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: goal.type.systemImage)
                    .foregroundColor(goal.type == .savings ? .green : .orange)
                Text(goal.name).font(.headline)
                Spacer()
                if goal.isComplete {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                } else if !goal.onTrack {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.orange)
                }
            }

            ProgressView(value: goal.progress)
                .tint(goal.isComplete ? .green : (goal.onTrack ? .accentColor : .orange))

            HStack {
                Text("\(goal.currentBalance.asCurrency) of \(goal.targetAmount.asCurrency)")
                    .font(.caption).foregroundColor(.secondary)
                Spacer()
                Text(goal.targetDate, style: .date)
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
