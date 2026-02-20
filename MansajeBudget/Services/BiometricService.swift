import Foundation
import LocalAuthentication

enum BiometricType {
    case none
    case touchID
    case faceID
    case opticID
}

@MainActor
final class BiometricService: ObservableObject {
    private let context = LAContext()

    var biometricType: BiometricType {
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        switch context.biometryType {
        case .faceID:       return .faceID
        case .touchID:      return .touchID
        case .opticID:      return .opticID
        default:            return .none
        }
    }

    var isAvailable: Bool {
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    func authenticate(reason: String = "Authenticate to access MansajeBudget") async -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }

    // Fallback to device passcode if biometrics fail
    func authenticateWithFallback(reason: String = "Authenticate to access MansajeBudget") async -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            return false
        }

        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}
