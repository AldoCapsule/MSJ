import SwiftUI

@MainActor
final class CategoriesViewModel: ObservableObject {
    @Published var categories: [UserCategory] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    var expenseCategories: [UserCategory] { categories.filter { $0.type == .expense && !$0.isHidden } }
    var incomeCategories: [UserCategory] { categories.filter { $0.type == .income && !$0.isHidden } }
    var systemCategories: [UserCategory] { categories.filter(\.isSystem) }
    var customCategories: [UserCategory] { categories.filter { !$0.isSystem } }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchCategories() }
    }

    func fetchCategories() async {
        isLoading = true
        defer { isLoading = false }
        do {
            categories = try await firestoreService.fetchUserCategories(uid: uid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addCategory(name: String, type: CategoryType, parentId: String?, icon: String, color: String) {
        let category = UserCategory(userId: uid, name: name, parentId: parentId,
                                    type: type, icon: icon, color: color)
        Task {
            do {
                try await firestoreService.saveUserCategory(category)
                categories.append(category)
                categories.sort { $0.name < $1.name }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func updateCategory(_ category: UserCategory) {
        Task {
            do {
                try await firestoreService.saveUserCategory(category)
                if let idx = categories.firstIndex(where: { $0.id == category.id }) {
                    categories[idx] = category
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteCategory(_ category: UserCategory) {
        guard !category.isSystem else { return }
        Task {
            do {
                try await firestoreService.deleteUserCategory(uid: uid, categoryId: category.id)
                categories.removeAll { $0.id == category.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func toggleHidden(_ category: UserCategory) {
        var updated = category
        updated.isHidden = !category.isHidden
        updateCategory(updated)
    }
}
