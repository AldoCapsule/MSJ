import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var biometricService = BiometricService()

    @AppStorage("biometricEnabled") private var biometricEnabled = false
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true

    @State private var showSignOutAlert = false
    @State private var showDeleteAccountAlert = false

    var body: some View {
        NavigationStack {
            List {
                // Profile
                Section {
                    profileHeader
                }

                // Security
                Section("Security") {
                    if biometricService.isAvailable {
                        Toggle(isOn: $biometricEnabled) {
                            let type = biometricService.biometricType
                            Label(
                                type == .faceID ? "Face ID Lock" : "Touch ID Lock",
                                systemImage: type == .faceID ? "faceid" : "touchid"
                            )
                        }
                        .onChange(of: biometricEnabled) { newValue in
                            authViewModel.toggleBiometric(enabled: newValue)
                        }
                    } else {
                        Label("Biometrics Not Available", systemImage: "exclamationmark.shield")
                            .foregroundColor(.secondary)
                    }
                }

                // Notifications
                Section("Preferences") {
                    Toggle(isOn: $notificationsEnabled) {
                        Label("Budget Alerts", systemImage: "bell.fill")
                    }
                }

                // About
                Section("About") {
                    LabeledContent("Version", value: appVersion)
                    LabeledContent("Build", value: buildNumber)
                    Link(destination: URL(string: "https://plaid.com/legal")!) {
                        Label("Plaid Privacy Policy", systemImage: "lock.doc")
                    }
                }

                // Danger Zone
                Section {
                    Button(role: .destructive) {
                        showSignOutAlert = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Settings")
            .alert("Sign Out?", isPresented: $showSignOutAlert) {
                Button("Sign Out", role: .destructive) { authViewModel.signOut() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to sign in again to access your data.")
            }
        }
    }

    private var profileHeader: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.2))
                    .frame(width: 60, height: 60)
                Text(initials)
                    .font(.title2.bold())
                    .foregroundColor(.accentColor)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(authViewModel.userProfile?.name ?? authViewModel.currentUser?.displayName ?? "User")
                    .font(.headline)
                Text(authViewModel.userProfile?.email ?? authViewModel.currentUser?.email ?? "")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var initials: String {
        let name = authViewModel.userProfile?.name ?? authViewModel.currentUser?.displayName ?? "U"
        return name.split(separator: " ")
            .compactMap { $0.first.map(String.init) }
            .prefix(2)
            .joined()
            .uppercased()
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}
