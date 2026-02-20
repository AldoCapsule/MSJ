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

                // Data & Privacy
                Section("Data & Privacy") {
                    NavigationLink {
                        ExportDataView()
                            .environmentObject(authViewModel)
                    } label: {
                        Label("Export Data", systemImage: "square.and.arrow.up")
                    }

                    Button(role: .destructive) {
                        showDeleteAccountAlert = true
                    } label: {
                        Label("Delete Account", systemImage: "person.crop.circle.badge.minus")
                            .foregroundColor(.red)
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
            .alert("Delete Account?", isPresented: $showDeleteAccountAlert) {
                Button("Delete", role: .destructive) {
                    // Request deletion via backend then sign out
                    Task { await requestAccountDeletion() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All your data will be permanently deleted within 30 days. This action cannot be undone.")
            }
        }
    }

    // MARK: - Account Deletion
    private func requestAccountDeletion() async {
        guard let uid = authViewModel.currentUser?.uid,
              let token = try? await authViewModel.currentUser?.getIDToken() else {
            authViewModel.signOut()
            return
        }
        let url = URL(string: "\(Constants.API.baseURL)/v1/privacy/delete-account")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue(uid, forHTTPHeaderField: "x-uid")
        _ = try? await URLSession.shared.data(for: req)
        authViewModel.signOut()
    }

    // MARK: - Profile Header
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

// MARK: - Export Data View
struct ExportDataView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var isExporting = false
    @State private var exportType: ExportType = .transactions
    @State private var exportFormat: ExportFormat = .csv
    @State private var resultMessage: String?
    @State private var showResult = false

    enum ExportType: String, CaseIterable {
        case transactions, balances
        var displayName: String { rawValue.capitalized }
    }
    enum ExportFormat: String, CaseIterable {
        case csv, json
        var displayName: String { rawValue.uppercased() }
    }

    var body: some View {
        Form {
            Section("Export Options") {
                Picker("Data Type", selection: $exportType) {
                    ForEach(ExportType.allCases, id: \.self) { t in
                        Text(t.displayName).tag(t)
                    }
                }
                Picker("Format", selection: $exportFormat) {
                    ForEach(ExportFormat.allCases, id: \.self) { f in
                        Text(f.displayName).tag(f)
                    }
                }
            }

            Section {
                Button {
                    Task { await requestExport() }
                } label: {
                    HStack {
                        Label("Export Now", systemImage: "square.and.arrow.up")
                        Spacer()
                        if isExporting { ProgressView() }
                    }
                }
                .disabled(isExporting)
            } footer: {
                Text("Your data will be prepared and downloaded. Large exports may take a moment.")
            }
        }
        .navigationTitle("Export Data")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Export", isPresented: $showResult) {
            Button("OK") {}
        } message: {
            Text(resultMessage ?? "")
        }
    }

    private func requestExport() async {
        isExporting = true
        defer { isExporting = false }
        guard let uid = authViewModel.currentUser?.uid,
              let token = try? await authViewModel.currentUser?.getIDToken() else {
            resultMessage = "Not authenticated."
            showResult = true
            return
        }
        let url = URL(string: "\(Constants.API.baseURL)/v1/exports")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue(uid, forHTTPHeaderField: "x-uid")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["type": exportType.rawValue, "format": exportFormat.rawValue]
        req.httpBody = try? JSONEncoder().encode(body)

        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                resultMessage = "Export complete. Check your email or the Files app."
            } else {
                resultMessage = "Export failed. Please try again."
            }
        } catch {
            resultMessage = "Export failed: \(error.localizedDescription)"
        }
        showResult = true
    }
}
