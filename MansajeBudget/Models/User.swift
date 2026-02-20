import Foundation

struct UserProfile: Codable, Identifiable {
    let id: String          // Firebase UID
    var name: String
    var email: String
    var biometricEnabled: Bool
    var notificationsEnabled: Bool
    var currency: String    // e.g. "USD"
    var createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id = "uid"
        case name, email, biometricEnabled, notificationsEnabled, currency, createdAt
    }

    init(
        id: String,
        name: String,
        email: String,
        biometricEnabled: Bool = false,
        notificationsEnabled: Bool = true,
        currency: String = "USD",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.biometricEnabled = biometricEnabled
        self.notificationsEnabled = notificationsEnabled
        self.currency = currency
        self.createdAt = createdAt
    }
}

extension UserProfile {
    var firestoreData: [String: Any] {
        [
            "uid": id,
            "name": name,
            "email": email,
            "biometricEnabled": biometricEnabled,
            "notificationsEnabled": notificationsEnabled,
            "currency": currency,
            "createdAt": createdAt
        ]
    }

    static func from(_ data: [String: Any]) -> UserProfile? {
        guard
            let id = data["uid"] as? String,
            let name = data["name"] as? String,
            let email = data["email"] as? String
        else { return nil }

        return UserProfile(
            id: id,
            name: name,
            email: email,
            biometricEnabled: data["biometricEnabled"] as? Bool ?? false,
            notificationsEnabled: data["notificationsEnabled"] as? Bool ?? true,
            currency: data["currency"] as? String ?? "USD",
            createdAt: (data["createdAt"] as? Date) ?? Date()
        )
    }
}
