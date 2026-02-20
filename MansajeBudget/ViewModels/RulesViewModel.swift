import SwiftUI

@MainActor
final class RulesViewModel: ObservableObject {
    @Published var rules: [CategorizationRule] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    func load(uid: String) {
        self.uid = uid
        Task { await fetchRules() }
    }

    func fetchRules() async {
        isLoading = true
        defer { isLoading = false }
        do {
            rules = try await firestoreService.fetchRules(uid: uid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addRule(matchType: RuleMatchType, matchValue: String, categoryId: String,
                 priority: Int, applyScope: RuleApplyScope) {
        let rule = CategorizationRule(userId: uid, priority: priority, matchType: matchType,
                                      matchValue: matchValue, actionCategoryId: categoryId,
                                      applyScope: applyScope)
        Task {
            do {
                try await firestoreService.saveRule(rule)
                rules.append(rule)
                rules.sort { $0.priority < $1.priority }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func toggleRule(_ rule: CategorizationRule) {
        var updated = rule
        updated.enabled = !rule.enabled
        Task {
            do {
                try await firestoreService.saveRule(updated)
                if let idx = rules.firstIndex(where: { $0.id == rule.id }) {
                    rules[idx] = updated
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteRule(_ rule: CategorizationRule) {
        Task {
            do {
                try await firestoreService.deleteRule(uid: uid, ruleId: rule.id)
                rules.removeAll { $0.id == rule.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func applyRuleToHistory(_ rule: CategorizationRule) {
        isLoading = true
        Task {
            defer { isLoading = false }
            guard let idToken = try? await AuthService.shared.getIDToken() else { return }
            var request = URLRequest(url: URL(string: Constants.Backend.V1.applyRule(rule.id))!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            if let (data, _) = try? await URLSession.shared.data(for: request),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let count = json["applied_to"] as? Int {
                successMessage = "Rule applied to \(count) transaction(s)."
            }
        }
    }
}
