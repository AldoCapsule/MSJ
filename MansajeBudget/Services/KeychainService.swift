import Foundation
import Security

final class KeychainService {
    static let shared = KeychainService()
    private init() {}

    // MARK: - Save
    @discardableResult
    func save(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      Constants.Keychain.service,
            kSecAttrAccount as String:      key,
            kSecValueData as String:        data,
            kSecAttrAccessible as String:   kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    // MARK: - Read
    func read(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: Constants.Keychain.service,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else { return nil }
        return string
    }

    // MARK: - Delete
    @discardableResult
    func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: Constants.Keychain.service,
            kSecAttrAccount as String: key
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }

    // MARK: - All Keys
    func allKeys() -> [String] {
        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      Constants.Keychain.service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String:       kSecMatchLimitAll
        ]

        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let items = result as? [[String: Any]] else { return [] }
        return items.compactMap { $0[kSecAttrAccount as String] as? String }
    }

    // MARK: - Plaid Convenience
    func savePlaidToken(_ token: String, accountId: String) {
        save(token, forKey: Constants.Keychain.plaidAccessTokenPrefix + accountId)
    }

    func plaidToken(for accountId: String) -> String? {
        read(forKey: Constants.Keychain.plaidAccessTokenPrefix + accountId)
    }

    func deletePlaidToken(for accountId: String) {
        delete(forKey: Constants.Keychain.plaidAccessTokenPrefix + accountId)
    }

    func allPlaidTokenKeys() -> [String] {
        allKeys().filter { $0.hasPrefix(Constants.Keychain.plaidAccessTokenPrefix) }
    }
}
