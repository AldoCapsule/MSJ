import SwiftUI
import LinkKit

struct LinkAccountView: UIViewControllerRepresentable {
    @EnvironmentObject var vm: AccountsViewModel
    @Environment(\.dismiss) private var dismiss

    let linkToken: String

    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()

        do {
            let handler = try PlaidService.shared.createLinkHandler(
                token: linkToken,
                onSuccess: { publicToken, institutionId, institutionName in
                    vm.handlePlaidSuccess(
                        publicToken: publicToken,
                        institutionId: institutionId,
                        institutionName: institutionName
                    )
                    dismiss()
                },
                onExit: {
                    dismiss()
                }
            )

            DispatchQueue.main.async {
                handler.open(presentUsing: .viewController(vc))
            }
        } catch {
            DispatchQueue.main.async {
                dismiss()
                vm.errorMessage = error.localizedDescription
            }
        }

        return vc
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
