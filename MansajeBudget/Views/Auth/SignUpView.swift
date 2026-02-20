import SwiftUI

struct SignUpView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var passwordsMatch: Bool { password == confirmPassword }
    private var isFormValid: Bool {
        !name.isEmpty && !email.isEmpty && password.count >= 6 && passwordsMatch
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "person.badge.plus.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.linearGradient(
                            colors: [.blue, .cyan],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                    Text("Create Account")
                        .font(.title.bold())
                    Text("Start tracking your finances today")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 24)

                // Form
                VStack(spacing: 16) {
                    LabeledTextField("Full Name", text: $name, contentType: .name)
                    LabeledTextField("Email", text: $email, contentType: .emailAddress, keyboardType: .emailAddress)

                    LabeledSecureField("Password", text: $password, contentType: .newPassword)
                    if password.count > 0 && password.count < 6 {
                        Text("Password must be at least 6 characters")
                            .font(.caption)
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    LabeledSecureField("Confirm Password", text: $confirmPassword, contentType: .newPassword)
                    if !confirmPassword.isEmpty && !passwordsMatch {
                        Text("Passwords do not match")
                            .font(.caption)
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                // Sign Up Button
                Button {
                    authViewModel.signUp(name: name, email: email, password: password)
                } label: {
                    Group {
                        if authViewModel.isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Create Account").fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isFormValid ? Color.accentColor : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!isFormValid || authViewModel.isLoading)

                // Error
                if let error = authViewModel.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }

                // Back to login
                Button {
                    dismiss()
                } label: {
                    Text("Already have an account? ")
                        .foregroundColor(.secondary)
                    + Text("Sign In").foregroundColor(.accentColor).bold()
                }
                .font(.footnote)
                .padding(.bottom, 32)
            }
            .padding(.horizontal, 24)
        }
        .navigationTitle("Sign Up")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Helper Components
struct LabeledTextField: View {
    let label: String
    @Binding var text: String
    var contentType: UITextContentType? = nil
    var keyboardType: UIKeyboardType = .default

    init(_ label: String, text: Binding<String>, contentType: UITextContentType? = nil, keyboardType: UIKeyboardType = .default) {
        self.label = label
        self._text = text
        self.contentType = contentType
        self.keyboardType = keyboardType
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            TextField(label, text: $text)
                .textContentType(contentType)
                .keyboardType(keyboardType)
                .autocapitalization(keyboardType == .emailAddress ? .none : .words)
                .textFieldStyle(.roundedBorder)
        }
    }
}

struct LabeledSecureField: View {
    let label: String
    @Binding var text: String
    var contentType: UITextContentType? = nil

    init(_ label: String, text: Binding<String>, contentType: UITextContentType? = nil) {
        self.label = label
        self._text = text
        self.contentType = contentType
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            SecureField(label, text: $text)
                .textContentType(contentType)
                .textFieldStyle(.roundedBorder)
        }
    }
}
