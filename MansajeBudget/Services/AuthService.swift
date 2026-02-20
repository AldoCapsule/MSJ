import Foundation
import FirebaseAuth
import GoogleSignIn
import AuthenticationServices
import CryptoKit

@MainActor
final class AuthService: NSObject, ObservableObject {
    static let shared = AuthService()
    @Published var currentUser: FirebaseAuth.User?
    private var authStateListener: AuthStateDidChangeListenerHandle?

    override init() {
        super.init()
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.currentUser = user
        }
    }

    deinit {
        if let listener = authStateListener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }

    // MARK: - Email / Password
    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func signUp(email: String, password: String, name: String) async throws -> FirebaseAuth.User {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        let changeRequest = result.user.createProfileChangeRequest()
        changeRequest.displayName = name
        try await changeRequest.commitChanges()
        return result.user
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    func resetPassword(email: String) async throws {
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }

    // MARK: - Google Sign In
    func signInWithGoogle(presenting viewController: UIViewController) async throws {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw AuthError.configurationMissing
        }
        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config

        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: viewController)
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.tokenMissing
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        try await Auth.auth().signIn(with: credential)
    }

    // MARK: - Apple Sign In
    private var currentNonce: String?

    func signInWithApple() -> ASAuthorizationAppleIDRequest {
        let nonce = randomNonceString()
        currentNonce = nonce
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)
        return request
    }

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .success(let auth):
            guard
                let appleIDCredential = auth.credential as? ASAuthorizationAppleIDCredential,
                let nonce = currentNonce,
                let appleIDToken = appleIDCredential.identityToken,
                let idTokenString = String(data: appleIDToken, encoding: .utf8)
            else { throw AuthError.tokenMissing }

            let credential = OAuthProvider.appleCredential(
                withIDToken: idTokenString,
                rawNonce: nonce,
                fullName: appleIDCredential.fullName
            )
            try await Auth.auth().signIn(with: credential)

        case .failure(let error):
            throw error
        }
    }

    // MARK: - Firebase ID Token (for backend calls)
    func getIDToken() async throws -> String {
        guard let user = Auth.auth().currentUser else { throw AuthError.notAuthenticated }
        return try await user.getIDToken()
    }

    // MARK: - Helpers
    private func randomNonceString(length: Int = 32) -> String {
        var randomBytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        return randomBytes.map { String(format: "%02x", $0) }.joined()
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }
}

enum AuthError: LocalizedError {
    case configurationMissing
    case tokenMissing
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .configurationMissing: return "Firebase configuration is missing."
        case .tokenMissing:         return "Authentication token is missing."
        case .notAuthenticated:     return "You are not signed in."
        }
    }
}
