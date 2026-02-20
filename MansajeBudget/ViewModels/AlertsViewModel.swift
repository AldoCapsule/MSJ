import SwiftUI

@MainActor
final class AlertsViewModel: ObservableObject {
    @Published var rules: [AlertRule] = []
    @Published var events: [AlertEvent] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    var unacknowledgedCount: Int { events.filter { !$0.isAcknowledged }.count }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchAll() }
    }

    func fetchAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let rulesFetch = firestoreService.fetchAlertRules(uid: uid)
            async let eventsFetch = firestoreService.fetchAlertEvents(uid: uid)
            (rules, events) = try await (rulesFetch, eventsFetch)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addRule(type: AlertRuleType, params: AlertRuleParams, channel: AlertChannel) {
        let rule = AlertRule(userId: uid, type: type, params: params, channel: channel)
        Task {
            do {
                try await firestoreService.saveAlertRule(rule)
                rules.append(rule)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func toggleRule(_ rule: AlertRule) {
        var updated = rule
        updated.enabled = !rule.enabled
        Task {
            do {
                try await firestoreService.saveAlertRule(updated)
                if let idx = rules.firstIndex(where: { $0.id == rule.id }) {
                    rules[idx] = updated
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteRule(_ rule: AlertRule) {
        Task {
            do {
                try await firestoreService.deleteAlertRule(uid: uid, ruleId: rule.id)
                rules.removeAll { $0.id == rule.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func acknowledgeEvent(_ event: AlertEvent) {
        Task {
            do {
                var updated = event
                updated.acknowledgedAt = Date()
                // Write to Firestore
                try await FirestoreService.shared.fetchAlertEvents(uid: uid) // refresh
                if let idx = events.firstIndex(where: { $0.id == event.id }) {
                    events[idx] = updated
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
