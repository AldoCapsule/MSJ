import SwiftUI
import FirebaseAuth

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var biometricLocked = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentUser: FirebaseAuth.User?
    @Published var userProfile: UserProfile?

    private let authService = AuthService.shared
    private let biometricService = BiometricService()
    private let firestoreService = FirestoreService.shared

    @AppStorage("biometricEnabled") private var biometricEnabled = false

    init() {
        // Observe Firebase auth state
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.currentUser = user
                self?.isAuthenticated = user != nil
                if let uid = user?.uid {
                    try? await self?.loadProfile(uid: uid)
                }
            }
        }
    }

    // MARK: - Sign In
    func signIn(email: String, password: String) {
        isLoading = true
        errorMessage = nil
        Task {
            defer { isLoading = false }
            do {
                try await authService.signIn(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Sign Up
    func signUp(name: String, email: String, password: String) {
        isLoading = true
        errorMessage = nil
        Task {
            defer { isLoading = false }
            do {
                let user = try await authService.signUp(email: email, password: password, name: name)
                let profile = UserProfile(id: user.uid, name: name, email: email)
                try await firestoreService.saveProfile(profile)
                userProfile = profile
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Sign Out
    func signOut() {
        do {
            try authService.signOut()
            biometricLocked = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Biometric
    func authenticateWithBiometrics() {
        Task {
            let success = await biometricService.authenticateWithFallback()
            biometricLocked = !success
        }
    }

    func checkBiometricLock() {
        guard biometricEnabled, isAuthenticated else { return }
        if biometricLocked {
            authenticateWithBiometrics()
        }
    }

    func lockIfBiometricEnabled() {
        if biometricEnabled {
            biometricLocked = true
        }
    }

    func toggleBiometric(enabled: Bool) {
        biometricEnabled = enabled
        Task {
            if var profile = userProfile {
                profile.biometricEnabled = enabled
                try? await firestoreService.saveProfile(profile)
                userProfile = profile
            }
        }
    }

    // MARK: - Reset Password
    func resetPassword(email: String) {
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                try await authService.resetPassword(email: email)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Profile
    private func loadProfile(uid: String) async throws {
        userProfile = try await firestoreService.fetchProfile(uid: uid)
    }
}
