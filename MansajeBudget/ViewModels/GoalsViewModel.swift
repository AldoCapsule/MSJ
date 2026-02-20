import SwiftUI

@MainActor
final class GoalsViewModel: ObservableObject {
    @Published var goals: [Goal] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showAddGoal = false

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    var totalTargetAmount: Double { goals.reduce(0) { $0 + $1.targetAmount } }
    var totalCurrentBalance: Double { goals.reduce(0) { $0 + $1.currentBalance } }
    var completedGoals: [Goal] { goals.filter(\.isComplete) }
    var activeGoals: [Goal] { goals.filter { !$0.isComplete } }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchGoals() }
    }

    func fetchGoals() async {
        isLoading = true
        defer { isLoading = false }
        do {
            goals = try await firestoreService.fetchGoals(uid: uid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addGoal(name: String, type: GoalType, targetAmount: Double, targetDate: Date,
                 monthlyContribution: Double, fundingAccountId: String?) {
        let goal = Goal(
            userId: uid, name: name, type: type,
            targetAmount: targetAmount, targetDate: targetDate,
            fundingAccountId: fundingAccountId,
            computedMonthlyContribution: monthlyContribution
        )
        Task {
            do {
                try await firestoreService.saveGoal(goal)
                goals.insert(goal, at: 0)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func updateGoal(_ goal: Goal) {
        Task {
            do {
                try await firestoreService.saveGoal(goal)
                if let idx = goals.firstIndex(where: { $0.id == goal.id }) {
                    goals[idx] = goal
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteGoal(_ goal: Goal) {
        Task {
            do {
                try await firestoreService.deleteGoal(uid: uid, goalId: goal.id)
                goals.removeAll { $0.id == goal.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
