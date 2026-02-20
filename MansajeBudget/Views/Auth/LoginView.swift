import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showSignUp = false
    @State private var showForgotPassword = false
    @State private var forgotEmail = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo
                    VStack(spacing: 8) {
                        Image(systemName: "dollarsign.circle.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.linearGradient(
                                colors: [.blue, .cyan],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                        Text("MansajeBudget")
                            .font(.largeTitle.bold())
                        Text("Your personal finance companion")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 48)

                    // Email / Password
                    VStack(spacing: 16) {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .textFieldStyle(.roundedBorder)

                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .textFieldStyle(.roundedBorder)

                        Button(action: { authViewModel.signIn(email: email, password: password) }) {
                            Group {
                                if authViewModel.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Sign In").fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.accentColor)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)

                        Button("Forgot password?") { showForgotPassword = true }
                            .font(.footnote)
                            .foregroundColor(.accentColor)
                    }
                    .padding(.horizontal)

                    // Divider
                    HStack {
                        Divider()
                        Text("or").font(.footnote).foregroundColor(.secondary)
                        Divider()
                    }
                    .padding(.horizontal)

                    // Apple Sign In
                    SignInWithAppleButton(.signIn) { request in
                        let appleRequest = authViewModel.authService.signInWithApple()
                        request.requestedScopes = appleRequest.requestedScopes
                        request.nonce = appleRequest.nonce
                    } onCompletion: { result in
                        Task {
                            try? await authViewModel.authService.handleAppleSignIn(result: result)
                        }
                    }
                    .frame(height: 50)
                    .cornerRadius(12)
                    .padding(.horizontal)

                    // Error
                    if let error = authViewModel.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    // Sign up link
                    Button {
                        showSignUp = true
                    } label: {
                        Text("Don't have an account? ")
                            .foregroundColor(.secondary)
                        + Text("Sign Up").foregroundColor(.accentColor).bold()
                    }
                    .font(.footnote)
                    .padding(.bottom, 32)
                }
            }
            .navigationDestination(isPresented: $showSignUp) {
                SignUpView()
            }
            .alert("Reset Password", isPresented: $showForgotPassword) {
                TextField("Email", text: $forgotEmail)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                Button("Send Reset Link") { authViewModel.resetPassword(email: forgotEmail) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Enter your email address and we'll send you a password reset link.")
            }
        }
    }
}

// Expose authService for Apple Sign In
extension AuthViewModel {
    var authService: AuthService { AuthService.shared }
}
