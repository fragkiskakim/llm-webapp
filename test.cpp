// api_coupling_example.cpp
#include <iostream>

namespace B {
    struct T {
        int value;
    };
}

namespace A {
    // API in namespace A depends on type B::T (this should create edge A -> B)
    void f(const B::T& x) {
        std::cout << "A::f called, x.value=" << x.value << "\n";
    }
}

namespace C {
    void caller() {
        B::T t{42};
        // Call site is in namespace C.
        // In API-coupling mode, you should NOT get edge C -> B just because of this call.
        A::f(t);
    }
}

int main() {
    C::caller();
    return 0;
}