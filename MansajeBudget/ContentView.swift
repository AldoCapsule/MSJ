import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var biometricService = BiometricService()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if authViewModel.isAuthenticated {
                if authViewModel.biometricLocked {
                    biometricLockScreen
                } else {
                    MainTabView()
                }
            } else {
                LoginView()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active && authViewModel.isAuthenticated {
                authViewModel.checkBiometricLock()
            } else if phase == .background {
                authViewModel.lockIfBiometricEnabled()
            }
        }
    }

    private var biometricLockScreen: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 72))
                .foregroundColor(.accentColor)

            Text("MansajeBudget")
                .font(.largeTitle.bold())

            Text("Authenticate to continue")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Button {
                authViewModel.authenticateWithBiometrics()
            } label: {
                Label("Unlock", systemImage: biometricService.biometricType == .faceID ? "faceid" : "touchid")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(14)
            }
            .padding(.horizontal, 40)
        }
        .padding()
    }
}
